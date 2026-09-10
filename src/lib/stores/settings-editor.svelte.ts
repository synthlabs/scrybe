import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
    commands,
    type ModelSelection,
    type SettingsApplyPhase,
    type SettingsError,
    type SettingsValues,
} from "$lib/bindings";
import { DefaultAppState } from "$lib/defaults";
import {
    reconcileValues,
    resetAdvanced,
    sameValues,
    settingsValues,
} from "$lib/settings/values.js";
import { app_state, internal_state } from "./state.svelte";

const copy = <T>(value: T): T => structuredClone($state.snapshot(value)) as T;

class SettingsEditor {
    draft: SettingsValues | null = $state(null);
    model: ModelSelection | null = $state(null);
    audio_open = $state(false);
    model_open = $state(false);
    choices_open = $state(false);
    busy = $state(false);
    phase: SettingsApplyPhase = $state("applying");
    error: SettingsError | null = $state(null);
    private baseline: SettingsValues | null = null;

    get values(): SettingsValues {
        return this.draft ?? settingsValues(copy(app_state.obj));
    }
    get dirty() {
        return (
            this.model !== null ||
            (this.draft !== null &&
                !sameValues(this.draft, settingsValues(copy(app_state.obj))))
        );
    }
    get requires_stop() {
        return (
            internal_state.obj.transcribe_running &&
            (this.model !== null ||
                this.values.current_device.id !==
                    app_state.obj.current_device.id)
        );
    }
    reconcile(saved: SettingsValues) {
        if (this.draft && this.baseline)
            this.draft = reconcileValues(
                copy(this.draft),
                this.baseline,
                saved,
            ) as SettingsValues;
        else this.draft = copy(saved);
        this.baseline = copy(saved);
    }
    edit(values: SettingsValues) {
        if (this.busy || !app_state.ready) return;
        this.draft = copy(values);
        this.error = null;
    }
    chooseModel(model: ModelSelection | null) {
        if (this.busy || !app_state.ready) return;
        this.model = copy(model);
        this.error = null;
    }
    reset() {
        this.edit(resetAdvanced(copy(this.values), DefaultAppState));
    }
    discard() {
        if (this.busy) return;
        this.draft = settingsValues(copy(app_state.obj));
        this.baseline = copy(this.draft);
        this.model = null;
        this.error = null;
    }
    async apply() {
        if (!app_state.ready || this.busy || !this.dirty || this.requires_stop)
            return false;
        this.busy = true;
        this.error = null;
        this.phase =
            this.model?.kind === "preset"
                ? "downloading"
                : this.model
                  ? "loading"
                  : "applying";
        let unlisten: UnlistenFn | undefined;
        try {
            unlisten = await listen<SettingsApplyPhase>(
                "settings_apply_progress",
                (event) => {
                    this.phase = event.payload;
                },
            );
            const result = await commands.applySettings({
                values: copy(this.values),
                model: copy(this.model),
            });
            if (result.status === "error") throw result.error;
            Object.assign(app_state.obj, result.data.values, {
                model_path: result.data.model_path,
            });
            this.draft = copy(result.data.values);
            this.baseline = copy(result.data.values);
            this.model = null;
            return true;
        } catch (error) {
            this.error =
                error &&
                typeof error === "object" &&
                "kind" in error &&
                "details" in error
                    ? (error as SettingsError)
                    : {
                          kind: "internal",
                          details:
                              error instanceof Error
                                  ? error.message
                                  : String(error),
                      };
            return false;
        } finally {
            unlisten?.();
            this.busy = false;
        }
    }
}

export const settings_editor = new SettingsEditor();
