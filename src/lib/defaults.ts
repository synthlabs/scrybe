import type { InternalState, AppState, GateTelemetryState } from "./bindings";

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
        name: "default",
        id: "",
        text_alignment: "center",
        background_color: "#030712",
        transparency: 75,
        font_size: 28,
        corner_radius: 4,
        padding_x: 12,
        padding_y: 6,
        font_weight: 600,
        drop_shadow: true,
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
};

export let DefaultGateTelemetryState: GateTelemetryState = {
    entries: [],
};
