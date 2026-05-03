import { SyncedState } from "tauri-svelte-synced-store";
import type {
    AppState,
    AudioMetricsState,
    GateTelemetryState,
    InternalState,
} from "$lib/bindings";
import {
    DefaultAppState,
    DefaultAudioMetricsState,
    DefaultGateTelemetryState,
    DefaultInternalState,
} from "$lib/defaults";

export const app_state = new SyncedState<AppState>(
    "app_state",
    DefaultAppState,
);
export const internal_state = new SyncedState<InternalState>(
    "internal_state",
    DefaultInternalState,
);
export const gate_telemetry = new SyncedState<GateTelemetryState>(
    "gate_telemetry",
    DefaultGateTelemetryState,
);
export const audio_metrics = new SyncedState<AudioMetricsState>(
    "audio_metrics",
    DefaultAudioMetricsState,
);
