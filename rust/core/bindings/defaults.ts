import type { AppState } from "./AppState";

export let DefaultAppState: AppState = {
    running: false,
    current_device: {
        name: "",
        id: "",
    },
    audio_buffer_size: 0,
    overlay_config: {
        name: "",
        id: "",
        text_alignment: "left",
    },
};
