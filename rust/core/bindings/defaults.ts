import type { AppState } from "./AppState";

export let DefaultAppState: AppState = {
    current_device: {
        name: "",
        id: "",
    },
    audio_format: {
        name: "",
        id: "",
    },
    model_path: "",
    audio_segment_size: 0,
    overlay_config: {
        name: "",
        id: "",
        text_alignment: "left",
        background_color: "",
        transparency: 0,
    },
    whisper_params: {
        toggles: {
            translate: false,
            suppress_blanks: false,
            print_special: false,
            print_progress: false,
            token_timestamps: false,
            single_segment: false,
            split_on_word: false,
            tdrz_enable: false,
        },
        language: "",
    },
    advanced_settings: {},
};
