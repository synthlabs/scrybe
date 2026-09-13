use super::{AudioError, AudioErrorKind, Cancellation, FailureHandler, WHISPER_SAMPLE_RATE};
use crate::devices::{AudioDevice, AudioDeviceOption, AudioSourceKind, DEFAULT_OUTPUT_ID};
use libpulse_binding as pulse;
use pulse::{callbacks::ListResult, context::Context, mainloop::standard::Mainloop};
use std::{
    cell::RefCell,
    collections::HashSet,
    rc::Rc,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

const TIMEOUT: Duration = Duration::from_secs(5);
const POLL_INTERVAL: pulse::time::MicroSeconds = pulse::time::MicroSeconds(10_000);

#[derive(Debug, Clone)]
struct Endpoint {
    name: String,
    description: String,
    monitor: Option<String>,
}

#[derive(Default)]
struct Snapshot {
    inputs: Vec<Endpoint>,
    outputs: Vec<Endpoint>,
    default_input: String,
    default_output: String,
}

impl Snapshot {
    fn options(&self) -> Vec<AudioDeviceOption> {
        let mut options = Vec::new();
        for (kind, prefix, default_id, default_name, endpoints) in [
            (
                AudioSourceKind::Input,
                "pulse:source:",
                "",
                &self.default_input,
                &self.inputs,
            ),
            (
                AudioSourceKind::Output,
                "pulse:sink:",
                DEFAULT_OUTPUT_ID,
                &self.default_output,
                &self.outputs,
            ),
        ] {
            options.push(AudioDeviceOption {
                id: default_id.into(),
                name: endpoints
                    .iter()
                    .find(|e| &e.name == default_name)
                    .map(|e| e.description.clone())
                    .unwrap_or_default(),
                kind: Some(kind),
                is_default: true,
            });
            options.extend(endpoints.iter().map(|endpoint| AudioDeviceOption {
                id: format!("{prefix}{}", endpoint.name),
                name: endpoint.description.clone(),
                kind: Some(kind),
                is_default: false,
            }));
        }
        options
    }

    fn resolve(&self, id: &str) -> Result<String, AudioError> {
        let (name, endpoints) = if id.is_empty() {
            (self.default_input.as_str(), &self.inputs)
        } else if id == DEFAULT_OUTPUT_ID {
            (self.default_output.as_str(), &self.outputs)
        } else if let Some(name) = id.strip_prefix("pulse:source:") {
            (name, &self.inputs)
        } else if let Some(name) = id.strip_prefix("pulse:sink:") {
            (name, &self.outputs)
        } else {
            return Err(AudioError::new(AudioErrorKind::UnsupportedDevice,
                "This saved audio source is no longer supported. Choose a microphone or computer audio device in Settings."));
        };
        endpoints.iter().find(|endpoint| endpoint.name == name && !name.is_empty())
            .map(|endpoint| endpoint.monitor.clone().unwrap_or_else(|| endpoint.name.clone()))
            .ok_or_else(|| AudioError::new(AudioErrorKind::DeviceUnavailable,
                "The selected audio source is unavailable. Reconnect it or choose another source in Settings."))
    }
}

struct Connection {
    context: Context,
    mainloop: Mainloop,
    cancelled: Cancellation,
    deadline: Instant,
}

impl Connection {
    fn new(cancelled: Cancellation, deadline: Instant) -> Result<Self, AudioError> {
        let mainloop = Mainloop::new()
            .ok_or_else(|| service_error("Could not create an audio event loop."))?;
        let mut context = Context::new(&mainloop, "Scrybe")
            .ok_or_else(|| service_error("Could not create an audio connection."))?;
        context
            .connect(None, pulse::context::FlagSet::NOAUTOSPAWN, None)
            .map_err(service_error)?;
        let mut connection = Self {
            context,
            mainloop,
            cancelled,
            deadline,
        };
        while connection.context.get_state() != pulse::context::State::Ready {
            connection.check_deadline()?;
            connection.pump()?;
        }
        Ok(connection)
    }

    fn check_deadline(&self) -> Result<(), AudioError> {
        if self.cancelled.load(Ordering::Acquire) {
            return Err(AudioError::new(
                AudioErrorKind::Cancelled,
                "Audio capture was cancelled.",
            ));
        }
        if Instant::now() >= self.deadline {
            return Err(AudioError::new(
                AudioErrorKind::Timeout,
                "The audio service did not respond within five seconds. Try again.",
            ));
        }
        Ok(())
    }

    fn pump(&mut self) -> Result<(), AudioError> {
        if matches!(
            self.context.get_state(),
            pulse::context::State::Failed | pulse::context::State::Terminated
        ) {
            return Err(service_error(self.context.errno()));
        }
        self.mainloop
            .prepare(Some(POLL_INTERVAL))
            .map_err(service_error)?;
        self.mainloop.poll().map_err(service_error)?;
        self.mainloop.dispatch().map_err(service_error)?;
        Ok(())
    }

    fn wait_operation<T: ?Sized>(
        &mut self,
        operation: &mut pulse::operation::Operation<T>,
    ) -> Result<(), AudioError> {
        while operation.get_state() == pulse::operation::State::Running {
            if let Err(error) = self.check_deadline().and_then(|_| self.pump()) {
                operation.cancel();
                return Err(error);
            }
        }
        Ok(())
    }

    fn watch_removals(&mut self) -> Result<Rc<RefCell<HashSet<u32>>>, AudioError> {
        use pulse::context::subscribe::{Facility, InterestMaskSet, Operation};
        let removed = Rc::new(RefCell::new(HashSet::new()));
        let changes = removed.clone();
        self.context
            .set_subscribe_callback(Some(Box::new(move |facility, operation, index| {
                if facility == Some(Facility::Source) && operation == Some(Operation::Removed) {
                    changes.borrow_mut().insert(index);
                }
            })));
        let accepted = Rc::new(RefCell::new(false));
        let result = accepted.clone();
        let mut operation = self
            .context
            .subscribe(InterestMaskSet::SOURCE, move |success| {
                *result.borrow_mut() = success
            });
        self.wait_operation(&mut operation)?;
        if !*accepted.borrow() {
            return Err(service_error(
                "Could not monitor audio device availability.",
            ));
        }
        Ok(removed)
    }

    fn snapshot(&mut self) -> Result<Snapshot, AudioError> {
        let snapshot = Rc::new(RefCell::new(Snapshot::default()));
        let failed = Rc::new(RefCell::new(false));
        let output = snapshot.clone();
        let mut operation = self.context.introspect().get_server_info(move |info| {
            let mut snapshot = output.borrow_mut();
            snapshot.default_input = info
                .default_source_name
                .as_deref()
                .unwrap_or_default()
                .into();
            snapshot.default_output = info.default_sink_name.as_deref().unwrap_or_default().into();
        });
        self.wait_operation(&mut operation)?;
        let output = snapshot.clone();
        let error = failed.clone();
        let mut operation = self
            .context
            .introspect()
            .get_source_info_list(move |result| match result {
                ListResult::Item(info) if info.monitor_of_sink.is_none() => {
                    if let Some(name) = info.name.as_deref() {
                        output.borrow_mut().inputs.push(Endpoint {
                            name: name.into(),
                            description: info
                                .description
                                .as_deref()
                                .filter(|s| !s.is_empty())
                                .unwrap_or(name)
                                .into(),
                            monitor: None,
                        });
                    }
                }
                ListResult::Error => *error.borrow_mut() = true,
                _ => {}
            });
        self.wait_operation(&mut operation)?;
        let output = snapshot.clone();
        let error = failed.clone();
        let mut operation =
            self.context
                .introspect()
                .get_sink_info_list(move |result| match result {
                    ListResult::Item(info) => {
                        if let (Some(name), Some(monitor)) =
                            (info.name.as_deref(), info.monitor_source_name.as_deref())
                        {
                            output.borrow_mut().outputs.push(Endpoint {
                                name: name.into(),
                                description: info
                                    .description
                                    .as_deref()
                                    .filter(|s| !s.is_empty())
                                    .unwrap_or(name)
                                    .into(),
                                monitor: Some(monitor.into()),
                            });
                        }
                    }
                    ListResult::Error => *error.borrow_mut() = true,
                    _ => {}
                });
        self.wait_operation(&mut operation)?;
        if *failed.borrow() {
            return Err(service_error("Could not read audio devices."));
        }
        let snapshot = std::mem::take(&mut *snapshot.borrow_mut());
        Ok(snapshot)
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        self.context.disconnect();
    }
}

fn service_error(details: impl std::fmt::Display) -> AudioError {
    AudioError::new(AudioErrorKind::ServiceUnavailable, format!(
        "Could not connect to the audio service. Scrybe needs PulseAudio or PipeWire with pipewire-pulse running. {details}"))
}

pub(super) fn get_devices() -> Result<Vec<AudioDeviceOption>, AudioError> {
    Connection::new(Arc::new(AtomicBool::new(false)), Instant::now() + TIMEOUT)?
        .snapshot()
        .map(|s| s.options())
}

type Reply = mpsc::Sender<Result<(), AudioError>>;

pub(super) struct PulseCapture {
    worker: Option<JoinHandle<()>>,
    play: mpsc::Sender<Reply>,
    cancelled: Cancellation,
    deadline: Instant,
}

impl PulseCapture {
    pub fn new(
        buffer: Arc<Mutex<Vec<f32>>>,
        device: AudioDevice,
        cancelled: Cancellation,
        on_error: FailureHandler,
        deadline: Instant,
    ) -> Result<Self, AudioError> {
        let (ready_tx, ready_rx) = mpsc::channel();
        let (play, commands) = mpsc::channel();
        let cancel = cancelled.clone();
        let worker = thread::Builder::new()
            .name("scrybe-audio".into())
            .spawn(move || {
                let mut started = false;
                let result = capture(
                    buffer,
                    &device.id,
                    cancel.clone(),
                    deadline,
                    &ready_tx,
                    commands,
                    &mut started,
                );
                if let Err(error) = result {
                    let _ = ready_tx.send(Err(error.clone()));
                    if started && !cancel.load(Ordering::Acquire) {
                        on_error(error);
                    }
                }
            })
            .map_err(|e| AudioError::new(AudioErrorKind::StreamFailed, format!("{e}")))?;
        let capture = Self {
            worker: Some(worker),
            play,
            cancelled,
            deadline,
        };
        receive(&ready_rx, deadline, &capture.cancelled)?;
        Ok(capture)
    }

    pub fn play(&self) -> Result<(), AudioError> {
        let (tx, rx) = mpsc::channel();
        if self.play.send(tx).is_err() && !self.cancelled.load(Ordering::Acquire) {
            return Err(AudioError::new(
                AudioErrorKind::StreamFailed,
                "The audio stream closed before capture started.",
            ));
        }
        receive(&rx, self.deadline, &self.cancelled)
    }
}

impl Drop for PulseCapture {
    fn drop(&mut self) {
        self.cancelled.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn receive(
    rx: &mpsc::Receiver<Result<(), AudioError>>,
    deadline: Instant,
    cancelled: &Cancellation,
) -> Result<(), AudioError> {
    let result = rx.recv_timeout(deadline.saturating_duration_since(Instant::now()))
        .map_err(|error| AudioError::new(
            if error == mpsc::RecvTimeoutError::Timeout { AudioErrorKind::Timeout } else { AudioErrorKind::StreamFailed },
            "The audio stream did not start. Check the audio service and selected device, then try again."));
    if cancelled.load(Ordering::Acquire) {
        return Err(AudioError::new(
            AudioErrorKind::Cancelled,
            "Audio capture was cancelled.",
        ));
    }
    result?
}

fn capture(
    buffer: Arc<Mutex<Vec<f32>>>,
    id: &str,
    cancelled: Cancellation,
    deadline: Instant,
    ready: &Reply,
    commands: mpsc::Receiver<Reply>,
    started: &mut bool,
) -> Result<(), AudioError> {
    let mut connection = Connection::new(cancelled.clone(), deadline)?;
    let removed = connection.watch_removals()?;
    let source = connection.snapshot()?.resolve(id)?;
    let spec = pulse::sample::Spec {
        format: pulse::sample::Format::FLOAT32NE,
        channels: 1,
        rate: WHISPER_SAMPLE_RATE,
    };
    let mut stream = pulse::stream::Stream::new(&mut connection.context, "Captions", &spec, None)
        .ok_or_else(|| {
        AudioError::new(
            AudioErrorKind::StreamFailed,
            "Could not create an audio stream.",
        )
    })?;
    let attributes = pulse::def::BufferAttr {
        maxlength: u32::MAX,
        tlength: u32::MAX,
        prebuf: u32::MAX,
        minreq: u32::MAX,
        fragsize: WHISPER_SAMPLE_RATE / 50 * 4,
    };
    stream
        .connect_record(
            Some(&source),
            Some(&attributes),
            pulse::stream::FlagSet::START_CORKED
                | pulse::stream::FlagSet::DONT_MOVE
                | pulse::stream::FlagSet::ADJUST_LATENCY,
        )
        .map_err(|e| AudioError::new(AudioErrorKind::DeviceUnavailable, format!("{e}")))?;
    while stream.get_state() != pulse::stream::State::Ready {
        check_stream(&stream, &connection)?;
        connection.check_deadline()?;
        connection.pump()?;
    }
    let source_index = stream.get_device_index().ok_or_else(|| {
        AudioError::new(
            AudioErrorKind::DeviceUnavailable,
            "The selected audio source disappeared before capture started.",
        )
    })?;
    let _ = ready.send(Ok(()));
    while !cancelled.load(Ordering::Acquire) {
        check_stream(&stream, &connection)?;
        if removed.borrow().contains(&source_index)
            || stream.get_device_index() != Some(source_index)
        {
            return Err(AudioError::new(AudioErrorKind::DeviceUnavailable,
                "The selected audio source disconnected. Reconnect it or choose another source in Settings."));
        }
        if let Ok(reply) = commands.try_recv() {
            let success = Rc::new(RefCell::new(false));
            let output = success.clone();
            let mut operation = stream.uncork(Some(Box::new(move |ok| *output.borrow_mut() = ok)));
            let result = connection.wait_operation(&mut operation).and_then(|_| {
                if *success.borrow() {
                    Ok(())
                } else {
                    Err(AudioError::new(
                        AudioErrorKind::StreamFailed,
                        "Could not start the selected audio stream.",
                    ))
                }
            });
            *started = result.is_ok();
            let _ = reply.send(result.clone());
            result?;
        }
        connection.pump()?;
        if !*started {
            connection.check_deadline()?;
            continue;
        }
        loop {
            let samples = match stream
                .peek()
                .map_err(|e| AudioError::new(AudioErrorKind::StreamFailed, format!("{e}")))?
            {
                pulse::stream::PeekResult::Empty => break,
                pulse::stream::PeekResult::Hole(bytes) => vec![0.0; bytes / 4],
                pulse::stream::PeekResult::Data(bytes) => bytes
                    .chunks_exact(4)
                    .map(|sample| f32::from_ne_bytes(sample.try_into().unwrap()))
                    .collect(),
            };
            stream
                .discard()
                .map_err(|e| AudioError::new(AudioErrorKind::StreamFailed, format!("{e}")))?;
            if let Ok(mut buffer) = buffer.lock() {
                buffer.extend(samples);
            }
        }
    }
    let _ = stream.disconnect();
    Ok(())
}

fn check_stream(stream: &pulse::stream::Stream, connection: &Connection) -> Result<(), AudioError> {
    if matches!(
        stream.get_state(),
        pulse::stream::State::Failed | pulse::stream::State::Terminated
    ) {
        return Err(AudioError::new(AudioErrorKind::DeviceUnavailable,
            format!("The selected audio source disconnected or became unavailable. Reconnect it or choose another source in Settings. {}", connection.context.errno())));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot() -> Snapshot {
        Snapshot {
            inputs: vec![Endpoint {
                name: "mic".into(),
                description: "H1n".into(),
                monitor: None,
            }],
            outputs: vec![Endpoint {
                name: "speakers".into(),
                description: "H1n".into(),
                monitor: Some("speakers.monitor".into()),
            }],
            default_input: "mic".into(),
            default_output: "speakers".into(),
        }
    }

    #[test]
    fn input_and_playback_with_the_same_label_route_to_different_sources() {
        let snapshot = snapshot();
        let options = snapshot.options();
        assert_eq!(options.len(), 4);
        assert_eq!(options[1].name, options[3].name);
        assert_ne!(options[1].id, options[3].id);
        assert_eq!(snapshot.resolve(&options[1].id).unwrap(), "mic");
        assert_eq!(
            snapshot.resolve(&options[3].id).unwrap(),
            "speakers.monitor"
        );
        assert!(!options.iter().any(|option| option.id.ends_with(".monitor")));
    }

    #[test]
    fn defaults_resolve_current_names_without_falling_back() {
        let mut snapshot = snapshot();
        assert_eq!(snapshot.resolve("").unwrap(), "mic");
        assert_eq!(
            snapshot.resolve(DEFAULT_OUTPUT_ID).unwrap(),
            "speakers.monitor"
        );
        snapshot.default_input = "gone".into();
        assert_eq!(
            snapshot.resolve("").unwrap_err().kind,
            AudioErrorKind::DeviceUnavailable
        );
        assert_eq!(
            snapshot.resolve("pulse:source:gone").unwrap_err().kind,
            AudioErrorKind::DeviceUnavailable
        );
        assert_eq!(
            snapshot.resolve("alsa:null").unwrap_err().kind,
            AudioErrorKind::UnsupportedDevice
        );
    }
}
