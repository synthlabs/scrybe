use anyhow::bail;
use clap::Parser;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, BufWriter, Read, Write};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

fn convert_wav() -> Result<(), anyhow::Error> {
    println!("converting");
    // "ffmpeg", "-v", "verbose", "-f", "s32le", "-ar", "48000", "-ac", "2", "-i", "-", "-f", "mp3", "-"
    let mut cmd = Command::new("ffmpeg");

    let cmd = cmd
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .stdin(Stdio::null())
        .args([
            "-v",
            "verbose",
            "-i",
            "recorded.wav",
            "-f",
            "s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-",
        ]);

    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut pid = cmd.spawn()?;

    let child_stderr = pid.stderr.take().unwrap();
    let _stderr_thread = thread::spawn(move || {
        let stderr_lines = BufReader::new(child_stderr).lines();
        for line in stderr_lines {
            let line = line.unwrap();
            println!("{}", line);
        }
    });

    let mut child_stdout = pid.stdout.take().unwrap();
    let stdout_thread = thread::spawn(move || {
        let mut buffer = Vec::new();
        child_stdout
            .read_to_end(&mut buffer)
            .expect("failed to read buffer");
    });

    println!("spawned");
    if !pid.wait()?.success() {
        bail!("unable to convert file: args: {:?}", cmd.get_args());
    }

    println!("waiting for stdout");
    stdout_thread.join().unwrap();

    // pid.stdout.unwrap().read_to_end(&mut buffer)?;

    // // ... later in code

    // println!("{:?}", buffer);

    println!("done");
    Ok(())
}

#[derive(Parser, Debug)]
#[command(version, about = "CPAL record_wav example", long_about = None)]
struct Opt {
    /// The audio device to use
    #[arg(short, long, default_value_t = String::from("default"))]
    device: String,
}

fn record_wav() -> Result<(), anyhow::Error> {
    let opt = Opt::parse();

    // Use ScreenCaptureKit host
    #[cfg(target_os = "macos")]
    let host = cpal::host_from_id(cpal::HostId::ScreenCaptureKit)?;
    #[cfg(not(target_os = "macos"))]
    let host = cpal::default_host();

    // Set up the input device and stream with the default input config.
    #[cfg(target_os = "macos")]
    let device = host
        .default_input_device()
        .expect("failed to find input device");
    #[cfg(not(target_os = "macos"))]
    let device = host
        .default_output_device()
        .expect("failed to find input device");

    println!("Input device: {}", device.name()?);

    #[cfg(target_os = "macos")]
    let config = device
        .default_input_config()
        .expect("Failed to get default input config");

    #[cfg(not(target_os = "macos"))]
    let config = device
        .default_output_config()
        .expect("Failed to get default input config");

    println!("Default config: {:?}", config);

    // The WAV file we're recording to.
    const PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/recorded.wav");

    // let spec = wav_spec_from_config(&config);

    // 16KHZ 32bit float mono
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    let writer = hound::WavWriter::create(PATH, spec)?;
    let writer = Arc::new(Mutex::new(Some(writer)));

    println!("Begin recording...");

    let writer_2 = writer.clone();

    let err_fn = move |err| {
        eprintln!("an error occurred on stream: {}", err);
    };

    let sample_rate = config.sample_rate().0;
    let channels = config.channels();

    let stream = match config.sample_format() {
        cpal::SampleFormat::I8 => device.build_input_stream(
            &config.into(),
            move |data, _: &_| write_input_data::<i8, i8>(data, &writer_2, sample_rate, channels),
            err_fn,
            None,
        )?,
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config.into(),
            move |data, _: &_| write_input_data::<i16, i16>(data, &writer_2, sample_rate, channels),
            err_fn,
            None,
        )?,
        cpal::SampleFormat::I32 => device.build_input_stream(
            &config.into(),
            move |data, _: &_| write_input_data::<i32, i32>(data, &writer_2, sample_rate, channels),
            err_fn,
            None,
        )?,
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config.into(),
            move |data, _: &_| write_input_data::<f32, f32>(data, &writer_2, sample_rate, channels),
            err_fn,
            None,
        )?,
        sample_format => {
            return Err(anyhow::Error::msg(format!(
                "Unsupported sample format '{sample_format}'"
            )))
        }
    };

    stream.play()?;

    // Let recording go for roughly three seconds.
    std::thread::sleep(std::time::Duration::from_secs(30));
    drop(stream);
    writer.lock().unwrap().take().unwrap().finalize()?;
    println!("Recording {} complete!", PATH);
    Ok(())
}

// ... [rest of the functions remain the same] ...

fn sample_format(format: cpal::SampleFormat) -> hound::SampleFormat {
    if format.is_float() {
        hound::SampleFormat::Float
    } else {
        hound::SampleFormat::Int
    }
}

fn wav_spec_from_config(config: &cpal::SupportedStreamConfig) -> hound::WavSpec {
    hound::WavSpec {
        channels: config.channels() as _,
        sample_rate: config.sample_rate().0 as _,
        bits_per_sample: (config.sample_format().sample_size() * 8) as _,
        sample_format: sample_format(config.sample_format()),
    }
}

type WavWriterHandle = Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>;

pub fn audio_resample(data: &[f32], from_rate: u32, sample_rate: u32, channels: u16) -> Vec<f32> {
    use samplerate::{convert, ConverterType};
    convert(
        from_rate as _,
        sample_rate as _,
        channels as _,
        ConverterType::SincBestQuality,
        data,
    )
    .unwrap_or_default()
}

fn write_input_data<T, U>(input: &[T], writer: &WavWriterHandle, sample_rate: u32, channels: u16)
where
    T: Sample,
    U: Sample + hound::Sample + FromSample<T>,
{
    // Convert the input samples to f32
    let samples: Vec<f32> = input
        .iter()
        .map(|s| s.to_float_sample().to_sample())
        .collect();

    // Resample the stereo audio to the desired sample rate
    let resampled_stereo: Vec<f32> = audio_resample(&samples, sample_rate, 16000, channels);

    let resampled_mono = whisper_rs::convert_stereo_to_mono_audio(&resampled_stereo).unwrap();

    // Write the mono data to the WAV file
    if let Ok(mut guard) = writer.try_lock() {
        if let Some(writer) = guard.as_mut() {
            for &sample in resampled_mono.iter() {
                writer.write_sample(sample).ok();
            }
        }
    }
}

fn iterate_devices() -> Result<(), anyhow::Error> {
    println!("Supported hosts:\n  {:?}", cpal::ALL_HOSTS);
    let available_hosts = cpal::available_hosts();
    println!("Available hosts:\n  {:?}", available_hosts);

    for host_id in available_hosts {
        println!("{}", host_id.name());
        let host = cpal::host_from_id(host_id)?;

        let default_in = host.default_input_device().map(|e| e.name().unwrap());
        let default_out = host.default_output_device().map(|e| e.name().unwrap());
        println!("  Default Input Device:\n    {:?}", default_in);
        println!("  Default Output Device:\n    {:?}", default_out);

        let devices = host.devices()?;
        println!("  Devices: ");
        for (device_index, device) in devices.enumerate() {
            println!("  {}. \"{}\"", device_index + 1, device.name()?);

            // Input configs
            if let Ok(conf) = device.default_input_config() {
                println!("    Default input stream config:\n      {:?}", conf);
            }
            let input_configs = match device.supported_input_configs() {
                Ok(f) => f.collect(),
                Err(e) => {
                    println!("    Error getting supported input configs: {:?}", e);
                    Vec::new()
                }
            };
            if !input_configs.is_empty() {
                println!("    All supported input stream configs:");
                for (config_index, config) in input_configs.into_iter().enumerate() {
                    println!(
                        "      {}.{}. {:?}",
                        device_index + 1,
                        config_index + 1,
                        config
                    );
                }
            }

            // Output configs
            if let Ok(conf) = device.default_output_config() {
                println!("    Default output stream config:\n      {:?}", conf);
            }
            let output_configs = match device.supported_output_configs() {
                Ok(f) => f.collect(),
                Err(e) => {
                    println!("    Error getting supported output configs: {:?}", e);
                    Vec::new()
                }
            };
            if !output_configs.is_empty() {
                println!("    All supported output stream configs:");
                for (config_index, config) in output_configs.into_iter().enumerate() {
                    println!(
                        "      {}.{}. {:?}",
                        device_index + 1,
                        config_index + 1,
                        config
                    );
                }
            }
        }
    }

    Ok(())
}

// ugly hack because the callback for new segment is not safe
extern "C" fn whisper_on_segment(
    _ctx: *mut whisper_rs_sys::whisper_context,
    state: *mut whisper_rs_sys::whisper_state,
    _n_new: std::os::raw::c_int,
    _user_data: *mut std::os::raw::c_void,
) {
    let last_segment = unsafe { whisper_rs_sys::whisper_full_n_segments_from_state(state) } - 1;
    let ret =
        unsafe { whisper_rs_sys::whisper_full_get_segment_text_from_state(state, last_segment) };
    if ret.is_null() {
        panic!("Failed to get segment text")
    }
    let c_str = unsafe { std::ffi::CStr::from_ptr(ret) };
    let r_str = c_str.to_str().expect("invalid segment text");
    println!("-> Segment ({}) text: {}", last_segment, r_str)
}

fn transcribe() -> Result<(), anyhow::Error> {
    println!("transcribing");

    let audio_file_path = "recorded.wav";
    let model_file_path = fs::read_dir("./models")
        .expect("failed to read './models' folder")
        .filter_map(|entry| {
            let entry = entry.expect("failed to read entry");
            let path = entry.path();
            if path.is_file() {
                let extension = path.extension().and_then(|s| s.to_str());
                if extension == Some("bin") {
                    Some(path)
                } else {
                    None
                }
            } else {
                None
            }
        })
        .next()
        .expect("no model file found")
        .to_str()
        .expect("invalid model file path")
        .to_string();

    println!("{} {}", audio_file_path, model_file_path);

    let mut params = WhisperContextParameters::default();
    params.use_gpu = true;

    let ctx = WhisperContext::new_with_params(model_file_path.as_str(), params)
        .expect("failed to load model");

    // let bar = ProgressBar::new(100);

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

    unsafe {
        params.set_new_segment_callback(Some(whisper_on_segment));
    }
    params.set_progress_callback_safe(|progress| println!("Progress: {}", progress));

    params.set_tdrz_enable(true);
    params.set_translate(true);
    params.set_language(Some("en"));

    let samples: Vec<f32> = hound::WavReader::open(audio_file_path)
        .unwrap()
        .into_samples::<f32>()
        .map(|x| x.unwrap())
        .collect();

    let mut state = ctx.create_state().expect("failed to create state");
    state
        .full(params, &samples[..])
        .expect("failed to run model");

    let num_segments = state
        .full_n_segments()
        .expect("failed to get number of segments");
    for i in 0..num_segments {
        let segment = state
            .full_get_segment_text(i)
            .expect("failed to get segment");
        let start_timestamp = state
            .full_get_segment_t0(i)
            .expect("failed to get segment start timestamp");
        let end_timestamp = state
            .full_get_segment_t1(i)
            .expect("failed to get segment end timestamp");
        println!("[{} - {}]: {}", start_timestamp, end_timestamp, segment);
        // TODO: format those as json
    }

    println!("Finished");

    Ok(())
}

fn main() -> Result<(), anyhow::Error> {
    // record_wav()
    // convert_wav()
    // iterate_devices()
    transcribe()
}
