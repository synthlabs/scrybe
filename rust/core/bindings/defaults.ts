import type { AppState } from "./AppState";

export let DefaultAppState: AppState = {
    running: false,
    current_device: {
        name: "",
        id: "",
    },
    audio_buffer_size: 2,
    overlay_config: {
        name: "",
        id: "",
        text_alignment: "left",
    },
    generation: 1,
    whisper_params: {
        translate: false,
        suppress_blanks: false,
        print_special: false,
        print_progress: false,
        token_timestamps: false,
        single_segment: false,
        split_on_word: false,
        tdrz_enable: false,
        language: "",
    },
    audio_format: {
        name: "",
        id: "",
    },
    model_path: "",
};
