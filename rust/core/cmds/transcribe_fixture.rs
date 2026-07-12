use std::{env, path::PathBuf, process};

use clap::Parser;
use scrybe_core::{
    segments::{
        GateEvaluationTelemetryEntry, SegmentAccumulator, SegmentEmissionDecision,
        SegmentEmissionGate,
    },
    validation::{build_report, load_wav_fixture, read_expected, write_json},
    whisper::{
        HallucinationProtectionConfig, VadSensitivity, WhisperManager, WhisperParams,
        WhisperProcessEvidence, WhisperSegment, WhisperText,
    },
};

use serde::Serialize;

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

    #[arg(long)]
    vad_model: Option<PathBuf>,

    #[arg(long, default_value_t = false)]
    protection: bool,

    #[arg(long, default_value = "balanced")]
    vad_sensitivity: String,

    #[arg(long)]
    incremental_step_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
struct IncrementalValidationReport {
    validation: scrybe_core::validation::ValidationReport,
    raw_items: Vec<WhisperText>,
    emissions: Vec<WhisperSegment>,
    gate: Vec<GateEvaluationTelemetryEntry>,
    last_evidence: WhisperProcessEvidence,
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
    let vad_model_path = args
        .vad_model
        .as_ref()
        .map(|path| path.to_string_lossy().into_owned());
    let mut whisper = WhisperManager::new_with_vad(
        &model.to_string_lossy(),
        args.gpu,
        vad_model_path.as_deref(),
    )?;
    let sensitivity = parse_vad_sensitivity(&args.vad_sensitivity)?;
    let protection = HallucinationProtectionConfig {
        enabled: args.protection,
        sensitivity,
    };

    let (report, incremental_report) = if let Some(step_ms) = args.incremental_step_ms {
        let step_samples = ((step_ms as u128 * scrybe_core::audio::WHISPER_SAMPLE_RATE as u128)
            / 1000)
            .max(1) as usize;
        let mut accumulator =
            SegmentAccumulator::new("fixture-segment", std::time::Duration::from_secs(3600));
        let mut gate = SegmentEmissionGate::new();
        let mut emissions = Vec::new();
        let mut gate_entries = Vec::new();
        let mut raw_items = Vec::new();
        let mut final_items = Vec::new();
        let mut last_evidence = WhisperProcessEvidence::default();

        for end in (step_samples..audio.samples.len())
            .step_by(step_samples)
            .chain(std::iter::once(audio.samples.len()))
        {
            let result = whisper.process_samples_with_protection(
                audio.samples[..end].to_vec(),
                params.clone(),
                protection,
            )?;
            raw_items = result.items.clone();
            last_evidence = result.evidence;
            let candidate = accumulator.replace_items(result.items);
            let evaluation = gate.evaluate_with_evidence(candidate, &last_evidence);
            gate_entries.push(evaluation.telemetry);
            if let SegmentEmissionDecision::Emit(segment) = evaluation.decision {
                final_items = segment.items.clone();
                emissions.push(segment);
            }
        }

        let report = build_report(
            audio.metadata.clone(),
            params.clone(),
            final_items,
            expected.as_ref(),
        );
        let incremental_report = IncrementalValidationReport {
            validation: report.clone(),
            raw_items,
            emissions,
            gate: gate_entries,
            last_evidence,
        };
        (report, Some(incremental_report))
    } else if args.protection {
        let result =
            whisper.process_samples_with_protection(audio.samples, params.clone(), protection)?;
        (
            build_report(audio.metadata, params, result.items, expected.as_ref()),
            None,
        )
    } else {
        let items = whisper.process_samples(audio.samples, params.clone())?;
        (
            build_report(audio.metadata, params, items, expected.as_ref()),
            None,
        )
    };

    let passed = report
        .comparison
        .as_ref()
        .map(|comparison| comparison.passed)
        .unwrap_or(true);

    match args.output.as_ref() {
        Some(path) => match incremental_report.as_ref() {
            Some(incremental) => write_json(path, incremental)?,
            None => write_json(path, &report)?,
        },
        None => match incremental_report.as_ref() {
            Some(incremental) => println!("{}", serde_json::to_string_pretty(incremental)?),
            None => println!("{}", serde_json::to_string_pretty(&report)?),
        },
    }

    if passed {
        Ok(())
    } else {
        Err(anyhow::anyhow!(
            "transcription fixture did not meet expected thresholds"
        ))
    }
}

fn parse_vad_sensitivity(value: &str) -> Result<VadSensitivity, anyhow::Error> {
    match value {
        "sensitive" => Ok(VadSensitivity::Sensitive),
        "balanced" => Ok(VadSensitivity::Balanced),
        "strict" => Ok(VadSensitivity::Strict),
        _ => Err(anyhow::anyhow!(
            "invalid VAD sensitivity {value:?}; expected sensitive, balanced, or strict"
        )),
    }
}

fn read_params(path: &PathBuf) -> Result<WhisperParams, anyhow::Error> {
    let data = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data)?)
}
