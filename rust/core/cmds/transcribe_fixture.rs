use std::{env, path::PathBuf, process};

use clap::Parser;
use scrybe_core::{
    validation::{build_report, load_wav_fixture, read_expected, write_json},
    whisper::{WhisperManager, WhisperParams},
};

#[derive(Debug, Parser)]
#[command(about = "Transcribe a known WAV fixture and optionally validate it against a golden")]
struct Args {
    #[arg(long)]
    model: Option<PathBuf>,

    #[arg(long)]
    audio: PathBuf,

    #[arg(long)]
    params: Option<PathBuf>,

    #[arg(long)]
    expected: Option<PathBuf>,

    #[arg(long)]
    output: Option<PathBuf>,

    #[arg(long, default_value_t = false)]
    gpu: bool,
}

fn main() {
    if let Err(err) = run() {
        eprintln!("{err:?}");
        process::exit(1);
    }
}

fn run() -> Result<(), anyhow::Error> {
    let args = Args::parse();
    let model = args
        .model
        .or_else(|| env::var_os("SCRYBE_TEST_MODEL").map(PathBuf::from))
        .ok_or_else(|| {
            anyhow::anyhow!("missing --model or SCRYBE_TEST_MODEL for fixture transcription")
        })?;

    let expected = match args.expected.as_ref() {
        Some(path) => Some(read_expected(path)?),
        None => None,
    };
    let params = match args.params.as_ref() {
        Some(path) => read_params(path)?,
        None => expected
            .as_ref()
            .map(|expected| expected.params.clone())
            .unwrap_or_default(),
    };

    let audio = load_wav_fixture(&args.audio)?;
    let mut whisper = WhisperManager::new(&model.to_string_lossy(), args.gpu)?;
    let items = whisper.process_samples(audio.samples, params.clone())?;
    let report = build_report(audio.metadata, params, items, expected.as_ref());

    let passed = report
        .comparison
        .as_ref()
        .map(|comparison| comparison.passed)
        .unwrap_or(true);

    match args.output.as_ref() {
        Some(path) => write_json(path, &report)?,
        None => println!("{}", serde_json::to_string_pretty(&report)?),
    }

    if passed {
        Ok(())
    } else {
        Err(anyhow::anyhow!(
            "transcription fixture did not meet expected thresholds"
        ))
    }
}

fn read_params(path: &PathBuf) -> Result<WhisperParams, anyhow::Error> {
    let data = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data)?)
}
