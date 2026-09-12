use clap::{Parser, Subcommand};
use scrybe_core::{
    audio::{self, AudioErrorKind, AudioManager, WHISPER_SAMPLE_RATE},
    devices::AudioDevice,
};
use std::{
    io::Write,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Parser)]
struct Args {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    List,
    CancelStartup,
    Lifecycle {
        #[arg(long)]
        id: String,
        #[arg(long, default_value_t = 21)]
        runs: u16,
    },
    Capture {
        #[arg(long, default_value = "")]
        id: String,
        #[arg(long, default_value_t = 2)]
        seconds: u64,
        #[arg(long)]
        output: Option<PathBuf>,
    },
}

fn main() -> anyhow::Result<()> {
    match Args::parse().command {
        Command::List => println!("{}", serde_json::to_string(&audio::get_devices()?)?),
        Command::CancelStartup => {
            let cancelled = Arc::new(AtomicBool::new(false));
            let cancel = cancelled.clone();
            let timer = thread::spawn(move || {
                thread::sleep(Duration::from_millis(300));
                cancel.store(true, Ordering::Release);
            });
            let start = Instant::now();
            let result = AudioManager::new_cancellable(
                Arc::new(Mutex::new(Vec::new())),
                AudioDevice::default(),
                cancelled,
                Arc::new(|_| {}),
            );
            timer.join().unwrap();
            match result {
                Err(error) if error.kind == AudioErrorKind::Cancelled => {}
                _ => anyhow::bail!("Expected cancelled startup"),
            }
            anyhow::ensure!(
                start.elapsed() < Duration::from_secs(2),
                "Cancellation took too long"
            );
            println!("{}", serde_json::json!({"event":"cancelled"}));
        }
        Command::Lifecycle { id, runs } => {
            #[cfg(target_os = "linux")]
            let mut baseline: Option<(usize, usize)> = None;
            for cycle in 0..runs {
                let (tx, rx) = mpsc::channel();
                let cancelled = Arc::new(AtomicBool::new(false));
                let mut manager = AudioManager::new_cancellable(
                    Arc::new(Mutex::new(Vec::new())),
                    AudioDevice {
                        id: id.clone(),
                        name: String::new(),
                    },
                    cancelled.clone(),
                    Arc::new(move |error| {
                        let _ = tx.send(error);
                    }),
                )?;
                manager.play_stream()?;
                thread::sleep(Duration::from_millis(25));
                cancelled.store(true, Ordering::Release);
                drop(manager);
                anyhow::ensure!(
                    rx.try_recv().is_err(),
                    "Cancellation reported a stream failure"
                );
                #[cfg(target_os = "linux")]
                {
                    let count_resources = || -> std::io::Result<(usize, usize)> {
                        Ok((
                            std::fs::read_dir("/proc/self/task")?.count(),
                            std::fs::read_dir("/proc/self/fd")?.count(),
                        ))
                    };
                    let mut resources = count_resources()?;
                    if let Some(expected) = baseline {
                        let initial = resources;
                        let deadline = Instant::now() + Duration::from_millis(250);
                        while (resources.0 > expected.0 || resources.1 > expected.1)
                            && Instant::now() < deadline
                        {
                            thread::sleep(Duration::from_millis(10));
                            resources = count_resources()?;
                        }
                        if initial != resources {
                            eprintln!("Cycle {cycle}: resources settled from {initial:?} to {resources:?} after join");
                        }
                        anyhow::ensure!(
                            resources.0 <= expected.0 && resources.1 <= expected.1,
                            "Capture resources changed on cycle {cycle}: {resources:?} != {expected:?} (threads, descriptors)"
                        );
                    }
                    baseline = Some(resources);
                }
            }
            println!(
                "{}",
                serde_json::json!({"event":"lifecycle_complete", "runs":runs})
            );
        }
        Command::Capture {
            id,
            seconds,
            output,
        } => {
            let samples = Arc::new(Mutex::new(Vec::new()));
            let (tx, rx) = mpsc::channel();
            let mut manager = AudioManager::new_cancellable(
                samples.clone(),
                AudioDevice {
                    id,
                    name: String::new(),
                },
                Arc::new(AtomicBool::new(false)),
                Arc::new(move |error| {
                    let _ = tx.send(error);
                }),
            )?;
            manager.play_stream()?;
            println!("{}", serde_json::json!({"event": "ready"}));
            std::io::stdout().flush()?;
            let deadline = Instant::now() + Duration::from_secs(seconds);
            while Instant::now() < deadline {
                if let Ok(error) = rx.recv_timeout(Duration::from_millis(20)) {
                    return Err(error.into());
                }
            }
            drop(manager);
            let samples = samples.lock().unwrap();
            let rms = (samples.iter().map(|s| f64::from(*s).powi(2)).sum::<f64>()
                / samples.len().max(1) as f64)
                .sqrt();
            if let Some(path) = output {
                let mut writer = hound::WavWriter::create(
                    path,
                    hound::WavSpec {
                        channels: 1,
                        sample_rate: WHISPER_SAMPLE_RATE,
                        bits_per_sample: 16,
                        sample_format: hound::SampleFormat::Int,
                    },
                )?;
                for sample in samples.iter() {
                    writer.write_sample((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)?;
                }
                writer.finalize()?;
            }
            println!(
                "{}",
                serde_json::json!({"event": "captured", "frames": samples.len(), "sample_rate": WHISPER_SAMPLE_RATE, "channels": 1, "rms": rms})
            );
        }
    }
    Ok(())
}
