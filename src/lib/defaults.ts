import type {
    InternalState,
    AppState,
    GateTelemetryState,
    AudioMetricsState,
} from "./bindings";
import { DEFAULT_OVERLAY_CONFIG } from "./overlay/layout-math.js";

// These mirror the Rust `Default` impls in src-tauri/src/types.rs and
// rust/core/src/whisper.rs. They MUST stay in sync — if a sync() ever fires
// before SyncedState receives the backend's emit response, the frontend's
// snapshot is what gets persisted to disk, so zero placeholders would corrupt
// real persisted state.
export let DefaultAppState: AppState = {
    current_device: {
        name: "default",
        id: "",
    },
    audio_format: {
        name: "",
        id: "",
    },
    model_path: "",
    audio_segment_size: 15,
    overlay_config: {
        canvas: { ...DEFAULT_OVERLAY_CONFIG.canvas },
        box: { ...DEFAULT_OVERLAY_CONFIG.box },
        style: { ...DEFAULT_OVERLAY_CONFIG.style },
    },
    home_right_rail: {
        session: false,
        audio_metrics: false,
        gate: false,
    },
    whisper_params: {
        toggles: {
            translate: false,
            suppress_blanks: true,
            print_special: false,
            print_progress: false,
            token_timestamps: true,
            single_segment: true,
            split_on_word: false,
            tdrz_enable: false,
        },
        language: "auto",
    },
    advanced_settings: {},
};

export let DefaultInternalState: InternalState = {
    transcribe_running: false,
    active_transcription_run_id: null,
    audio_step_size: 500,
    version: "",
    name: "",
    runtime_dependency: {
        status: "unknown",
        has_nvidia_gpu: false,
        reason: "",
        action_url: null,
    },
    overlay_test: {
        visible: false,
        text: "",
        expires_at_ms: null,
    },
};

export let DefaultGateTelemetryState: GateTelemetryState = {
    entries: [],
};

export let DefaultAudioMetricsState: AudioMetricsState = {
    segment_sample_len: 0,
    input_rms: 0,
    last_inference_ms: 0,
    inference_sample_count: 0,
    inference_std_dev_ms: 0,
    inference_p90_ms: 0,
    inference_p95_ms: 0,
    inference_p99_ms: 0,
    gate_total_evaluations: 0,
    gate_total_emits: 0,
    gate_emit_rate: 0,
};
