use scrybe_core::audio::Cancellation;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tokio::sync::oneshot;

pub const START_TIMEOUT: Duration = scrybe_core::audio::CAPTURE_START_TIMEOUT;
pub const START_POLL: Duration = Duration::from_millis(10);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum StartupPhase {
    Preparing,
    WaitingForPreviousRun,
    WaitingForModel,
    OpeningDevice,
    StartingStream,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum SessionErrorKind {
    Timeout,
    Cancelled,
    Busy,
    Unavailable,
    Failed,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
pub struct SessionError {
    pub run_id: String,
    pub phase: StartupPhase,
    pub kind: SessionErrorKind,
    pub details: String,
}

impl SessionError {
    pub fn new(
        run: &RunControl,
        phase: StartupPhase,
        kind: SessionErrorKind,
        details: impl Into<String>,
    ) -> Self {
        Self {
            run_id: run.id.clone(),
            phase,
            kind,
            details: details.into(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
pub struct SessionRequest {
    pub client_id: String,
    pub sequence: u64,
}

#[derive(Clone, Debug)]
pub struct RunControl {
    pub id: String,
    pub cancelled: Cancellation,
    pub deadline: Instant,
    pub request: Option<SessionRequest>,
}

impl RunControl {
    pub fn new(id: String, deadline: Instant) -> Self {
        Self {
            id,
            deadline,
            cancelled: Arc::new(AtomicBool::new(false)),
            request: None,
        }
    }

    pub fn cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }
}

type Reply = oneshot::Sender<Result<(), SessionError>>;

struct ActiveRun {
    control: RunControl,
    phase: StartupPhase,
    reply: Option<Reply>,
}

#[derive(Default)]
struct Lifecycle {
    active: Option<ActiveRun>,
    worker: Option<String>,
    reset_revision: u64,
    requests: HashMap<String, u64>,
}

#[derive(Clone, Debug, Default, Serialize, specta::Type)]
pub struct SessionReset {
    pub revision: u64,
}

#[derive(Default)]
pub struct SessionRuntime {
    lifecycle: Mutex<Lifecycle>,
    closing: AtomicBool,
}

impl SessionRuntime {
    fn accept_request(state: &mut Lifecycle, request: Option<&SessionRequest>) -> bool {
        let Some(request) = request else {
            return true;
        };
        let sequence = state.requests.entry(request.client_id.clone()).or_default();
        if request.sequence <= *sequence {
            return false;
        }
        *sequence = request.sequence;
        true
    }

    // Publication is serialized with invalidation. Never acquire a model or audio lock here.
    pub fn reserve(
        &self,
        run: RunControl,
        reply: Reply,
        publish: impl FnOnce(),
    ) -> Result<(), SessionError> {
        let mut state = self.lifecycle.lock().unwrap();
        if !Self::accept_request(&mut state, run.request.as_ref()) {
            return Err(SessionError::new(
                &run,
                StartupPhase::Preparing,
                SessionErrorKind::Cancelled,
                "This startup request was superseded.",
            ));
        }
        if self.closing.load(Ordering::Acquire) || state.active.is_some() {
            return Err(SessionError::new(
                &run,
                StartupPhase::Preparing,
                SessionErrorKind::Busy,
                "A session is already active or Scrybe is closing.",
            ));
        }
        state.active = Some(ActiveRun {
            control: run,
            phase: StartupPhase::Preparing,
            reply: Some(reply),
        });
        publish();
        Ok(())
    }

    pub fn phase(&self, run: &RunControl, phase: StartupPhase) -> bool {
        let mut state = self.lifecycle.lock().unwrap();
        let Some(active) = state
            .active
            .as_mut()
            .filter(|active| active.control.id == run.id)
        else {
            return false;
        };
        if run.cancelled() || self.closing.load(Ordering::Acquire) {
            return false;
        }
        if active.phase != phase {
            tracing::debug!(run_id = %run.id, ?phase, "session startup phase");
        }
        active.phase = phase;
        true
    }

    pub fn claim_worker(&self, run: &RunControl) -> bool {
        let mut state = self.lifecycle.lock().unwrap();
        if state.worker.is_some() || !Self::is_active(&state, run) || Instant::now() >= run.deadline
        {
            return false;
        }
        state.worker = Some(run.id.clone());
        tracing::debug!(run_id = %run.id, "session worker reserved");
        true
    }

    pub fn has_worker(&self) -> bool {
        self.lifecycle.lock().unwrap().worker.is_some()
    }

    fn is_current(state: &Lifecycle, run: &RunControl) -> bool {
        state
            .active
            .as_ref()
            .is_some_and(|active| active.control.id == run.id)
    }

    fn is_active(state: &Lifecycle, run: &RunControl) -> bool {
        !run.cancelled() && Self::is_current(state, run)
    }

    pub fn publish(&self, run: &RunControl, publish: impl FnOnce()) -> bool {
        let state = self.lifecycle.lock().unwrap();
        if self.closing.load(Ordering::Acquire) || !Self::is_active(&state, run) {
            return false;
        }
        publish();
        true
    }

    pub fn ready(&self, run: &RunControl, publish: impl FnOnce()) -> bool {
        let mut state = self.lifecycle.lock().unwrap();
        if self.closing.load(Ordering::Acquire)
            || !Self::is_active(&state, run)
            || Instant::now() >= run.deadline
        {
            return false;
        }
        let active = state.active.as_mut().unwrap();
        let Some(reply) = active.reply.take() else {
            return false;
        };
        publish();
        let _ = reply.send(Ok(()));
        true
    }

    pub fn fail(
        &self,
        run: &RunControl,
        kind: SessionErrorKind,
        details: impl Into<String>,
        publish: impl FnOnce(bool),
    ) {
        let mut state = self.lifecycle.lock().unwrap();
        if !Self::is_current(&state, run) {
            return;
        }
        let active = state.active.take().unwrap();
        run.cancelled.store(true, Ordering::Release);
        let starting = active.reply.is_some();
        let kind =
            if starting && Instant::now() >= run.deadline && kind != SessionErrorKind::Cancelled {
                SessionErrorKind::Timeout
            } else {
                kind
            };
        let error = SessionError::new(run, active.phase, kind, details);
        publish(starting);
        if let Some(reply) = active.reply {
            let _ = reply.send(Err(error));
        }
    }

    pub fn timeout(&self, run: &RunControl, publish: impl FnOnce()) {
        let mut state = self.lifecycle.lock().unwrap();
        if !Self::is_current(&state, run) || state.active.as_ref().unwrap().reply.is_none() {
            return;
        }
        let active = state.active.take().unwrap();
        run.cancelled.store(true, Ordering::Release);
        publish();
        let error = SessionError::new(
            run,
            active.phase,
            SessionErrorKind::Timeout,
            "Captions did not start within five seconds.",
        );
        let _ = active.reply.unwrap().send(Err(error));
    }

    fn cancel_locked(state: &mut Lifecycle) {
        if let Some(active) = state.active.take() {
            active.control.cancelled.store(true, Ordering::Release);
            if let Some(reply) = active.reply {
                let _ = reply.send(Err(SessionError::new(
                    &active.control,
                    active.phase,
                    SessionErrorKind::Cancelled,
                    "Session startup was cancelled.",
                )));
            }
        }
    }

    pub fn stop(&self, request: Option<&SessionRequest>, publish: impl FnOnce()) {
        let mut state = self.lifecycle.lock().unwrap();
        if !Self::accept_request(&mut state, request) {
            return;
        }
        Self::cancel_locked(&mut state);
        publish();
    }

    pub fn reset(
        &self,
        request: Option<&SessionRequest>,
        publish: impl FnOnce(&SessionReset),
    ) -> SessionReset {
        let mut state = self.lifecycle.lock().unwrap();
        if !Self::accept_request(&mut state, request) {
            return SessionReset {
                revision: state.reset_revision,
            };
        }
        Self::cancel_locked(&mut state);
        state.reset_revision += 1;
        let reset = SessionReset {
            revision: state.reset_revision,
        };
        publish(&reset);
        reset
    }

    pub fn worker_finished(&self, run: &RunControl, publish: impl FnOnce()) {
        let mut state = self.lifecycle.lock().unwrap();
        if state.worker.as_deref() == Some(&run.id) {
            state.worker = None;
            tracing::debug!(run_id = %run.id, "session worker released");
        }
        if Self::is_current(&state, run) {
            let active = state.active.take().unwrap();
            run.cancelled.store(true, Ordering::Release);
            publish();
            if let Some(reply) = active.reply {
                let kind = if Instant::now() >= run.deadline {
                    SessionErrorKind::Timeout
                } else {
                    SessionErrorKind::Failed
                };
                let _ = reply.send(Err(SessionError::new(
                    run,
                    active.phase,
                    kind,
                    "The session worker stopped before capture started.",
                )));
            }
        }
    }

    pub fn close(&self) {
        self.closing.store(true, Ordering::Release);
        if let Ok(mut state) = self.lifecycle.try_lock() {
            Self::cancel_locked(&mut state);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reserve(
        runtime: &SessionRuntime,
        id: &str,
    ) -> (RunControl, oneshot::Receiver<Result<(), SessionError>>) {
        let run = RunControl::new(id.into(), Instant::now() + START_TIMEOUT);
        let (tx, rx) = oneshot::channel();
        runtime.reserve(run.clone(), tx, || {}).unwrap();
        (run, rx)
    }

    #[test]
    fn cancel_and_reset_fence_start_commands_that_arrive_late() {
        let runtime = SessionRuntime::default();
        let request = |sequence| SessionRequest {
            client_id: "window".into(),
            sequence,
        };
        runtime.stop(Some(&request(2)), || {});
        let mut run = RunControl::new("late".into(), Instant::now() + START_TIMEOUT);
        run.request = Some(request(1));
        let (tx, _) = oneshot::channel();
        assert_eq!(
            runtime
                .reserve(run, tx, || panic!("late start"))
                .unwrap_err()
                .kind,
            SessionErrorKind::Cancelled
        );
        let mut run = RunControl::new("current".into(), Instant::now() + START_TIMEOUT);
        run.request = Some(request(3));
        let (tx, _) = oneshot::channel();
        runtime.reserve(run.clone(), tx, || {}).unwrap();
        runtime.stop(Some(&request(2)), || panic!("late stop"));
        runtime.reset(Some(&request(1)), |_| panic!("late reset"));
        assert!(runtime.publish(&run, || {}));
        runtime.reset(Some(&request(4)), |_| {});
        assert!(!runtime.publish(&run, || panic!("old run")));
    }

    #[test]
    fn backend_cancellation_does_not_abandon_the_pending_reply() {
        let runtime = SessionRuntime::default();
        let (run, mut reply) = reserve(&runtime, "backend");
        assert!(runtime.claim_worker(&run));
        run.cancelled.store(true, Ordering::Release);
        runtime.fail(&run, SessionErrorKind::Failed, "backend failed", |_| {});
        assert_eq!(
            reply.try_recv().unwrap().unwrap_err().kind,
            SessionErrorKind::Failed
        );
        runtime.worker_finished(&run, || panic!("already failed"));
        assert!(!runtime.has_worker());
        reserve(&runtime, "retry");
    }

    #[test]
    fn cancelled_backend_still_reaches_the_deadline() {
        let runtime = SessionRuntime::default();
        let (run, mut reply) = reserve(&runtime, "backend");
        run.cancelled.store(true, Ordering::Release);
        runtime.timeout(&run, || {});
        assert_eq!(
            reply.try_recv().unwrap().unwrap_err().kind,
            SessionErrorKind::Timeout
        );
    }

    #[test]
    fn reset_waits_for_an_inflight_publication_then_excludes_old_work() {
        let runtime = Arc::new(SessionRuntime::default());
        let (run, _) = reserve(&runtime, "old");
        let events = Arc::new(Mutex::new(Vec::new()));
        let (entered_tx, entered_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let thread_runtime = runtime.clone();
        let thread_events = events.clone();
        let thread_run = run.clone();
        let worker = std::thread::spawn(move || {
            thread_runtime.publish(&thread_run, || {
                entered_tx.send(()).unwrap();
                release_rx.recv().unwrap();
                thread_events.lock().unwrap().push("caption");
            })
        });
        entered_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        let reset_runtime = runtime.clone();
        let reset_events = events.clone();
        let reset = std::thread::spawn(move || {
            reset_runtime.reset(None, |_| reset_events.lock().unwrap().push("reset"))
        });
        release_tx.send(()).unwrap();
        worker.join().unwrap();
        reset.join().unwrap();
        assert_eq!(*events.lock().unwrap(), ["caption", "reset"]);
        assert!(!runtime.publish(&run, || panic!("caption after reset")));
    }

    #[test]
    fn timeout_settles_start_without_waiting_for_worker_cleanup() {
        let runtime = SessionRuntime::default();
        let (one, mut reply) = reserve(&runtime, "one");
        assert!(runtime.claim_worker(&one));
        runtime.phase(&one, StartupPhase::OpeningDevice);
        runtime.timeout(&one, || {});
        let error = reply.try_recv().unwrap().unwrap_err();
        assert_eq!(error.kind, SessionErrorKind::Timeout);
        assert_eq!(error.phase, StartupPhase::OpeningDevice);
        assert!(one.cancelled());
        assert!(runtime.has_worker());
        assert!(!runtime.ready(&one, || panic!("late readiness")));
        assert!(!runtime.publish(&one, || panic!("late publication")));
        let (two, _) = reserve(&runtime, "two");
        assert!(!runtime.claim_worker(&two));
        runtime.worker_finished(&one, || panic!("stale cleanup"));
        assert!(runtime.claim_worker(&two));
    }

    #[test]
    fn readiness_wins_once_and_timeout_cannot_stop_running_capture() {
        let runtime = SessionRuntime::default();
        let (run, mut reply) = reserve(&runtime, "ready");
        assert!(runtime.ready(&run, || {}));
        assert!(reply.try_recv().unwrap().is_ok());
        runtime.timeout(&run, || panic!("ready run timed out"));
        assert!(!runtime.ready(&run, || panic!("duplicate readiness")));
        assert!(runtime.publish(&run, || {}));
    }

    #[test]
    fn failure_after_the_deadline_reports_timeout_even_before_the_timer_runs() {
        let runtime = SessionRuntime::default();
        let run = RunControl::new("expired".into(), Instant::now());
        let (tx, mut rx) = oneshot::channel();
        runtime.reserve(run.clone(), tx, || {}).unwrap();
        runtime.fail(&run, SessionErrorKind::Failed, "native failure", |_| {});
        assert_eq!(
            rx.try_recv().unwrap().unwrap_err().kind,
            SessionErrorKind::Timeout
        );
    }

    #[test]
    fn expired_readiness_never_reports_success() {
        let runtime = SessionRuntime::default();
        let run = RunControl::new("expired".into(), Instant::now());
        let (tx, mut rx) = oneshot::channel();
        runtime.reserve(run.clone(), tx, || {}).unwrap();
        assert!(!runtime.ready(&run, || panic!("expired readiness")));
        assert!(!runtime.claim_worker(&run));
        runtime.timeout(&run, || {});
        assert_eq!(
            rx.try_recv().unwrap().unwrap_err().kind,
            SessionErrorKind::Timeout
        );
    }

    #[test]
    fn reset_cancels_and_fences_every_old_publication() {
        let runtime = SessionRuntime::default();
        let (old, mut reply) = reserve(&runtime, "old");
        let reset = runtime.reset(None, |reset| assert_eq!(reset.revision, 1));
        assert_eq!(reset.revision, 1);
        assert_eq!(
            reply.try_recv().unwrap().unwrap_err().kind,
            SessionErrorKind::Cancelled
        );
        let (new, _) = reserve(&runtime, "new");
        runtime.fail(&old, SessionErrorKind::Failed, "late", |_| {
            panic!("stale error")
        });
        runtime.worker_finished(&old, || panic!("stale clear"));
        assert!(!runtime.publish(&old, || panic!("stale stats/captions")));
        assert!(runtime.publish(&new, || {}));
        assert_eq!(runtime.reset(None, |_| {}).revision, 2);
    }

    #[test]
    fn stop_close_and_worker_failure_settle_pending_requests() {
        let runtime = SessionRuntime::default();
        let (run, mut reply) = reserve(&runtime, "stopped");
        runtime.stop(None, || {});
        runtime.stop(None, || {});
        assert!(run.cancelled());
        assert_eq!(
            reply.try_recv().unwrap().unwrap_err().kind,
            SessionErrorKind::Cancelled
        );
        let (run, mut reply) = reserve(&runtime, "failed");
        assert!(runtime.claim_worker(&run));
        runtime.worker_finished(&run, || {});
        assert_eq!(
            reply.try_recv().unwrap().unwrap_err().kind,
            SessionErrorKind::Failed
        );
        let (run, mut reply) = reserve(&runtime, "closed");
        assert!(runtime.claim_worker(&run));
        runtime.close();
        assert!(run.cancelled());
        assert_eq!(
            reply.try_recv().unwrap().unwrap_err().kind,
            SessionErrorKind::Cancelled
        );
        let (tx, _) = oneshot::channel();
        assert!(runtime.reserve(run, tx, || {}).is_err());
    }

    #[test]
    fn close_never_waits_for_a_busy_publication_lock() {
        let runtime = SessionRuntime::default();
        let guard = runtime.lifecycle.lock().unwrap();
        runtime.close();
        assert!(runtime.closing.load(Ordering::Acquire));
        drop(guard);
    }

    #[test]
    fn repeated_timeouts_cannot_accumulate_native_workers() {
        let runtime = SessionRuntime::default();
        let (first, _) = reserve(&runtime, "first");
        assert!(runtime.claim_worker(&first));
        runtime.timeout(&first, || {});
        for index in 0..100 {
            let (run, mut reply) = reserve(&runtime, &index.to_string());
            assert!(!runtime.claim_worker(&run));
            runtime.timeout(&run, || {});
            assert_eq!(
                reply.try_recv().unwrap().unwrap_err().kind,
                SessionErrorKind::Timeout
            );
        }
        runtime.worker_finished(&first, || panic!("stale completion"));
        assert!(!runtime.has_worker());
    }
}
