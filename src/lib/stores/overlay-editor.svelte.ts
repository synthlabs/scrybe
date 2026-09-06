import { invoke } from "@tauri-apps/api/core";
import { SyncedState } from "tauri-svelte-synced-store";
import type { OverlayConfig, OverlayTestState } from "$lib/bindings";
import { app_state } from "./state.svelte";
import { configKey } from "$lib/overlay/sample.js";
import { debounce } from "$lib/overlay/timing.js";

export const overlay_test = new SyncedState<OverlayTestState>("overlay_test", {
    id: "",
    config: null,
    text: "",
    started_at_ms: 0,
    expires_at_ms: 0,
    revision: 0,
});

const copy = <T>(value: T): T => structuredClone($state.snapshot(value)) as T;

class OverlayEditor {
    draft: OverlayConfig | null = $state(null);
    position_open = $state(false);
    styling_open = $state(false);
    sample_text = $state("");
    busy = $state(false);
    test_busy = $state(false);
    test_error: unknown = $state(null);
    private baseline = "";
    private revision = 0;

    get config() {
        return this.draft ?? app_state.obj.overlay_config;
    }
    get dirty() {
        return (
            this.draft !== null &&
            configKey(this.draft) !== configKey(app_state.obj.overlay_config)
        );
    }

    reconcile(saved: OverlayConfig) {
        const key = configKey(saved);
        if (!this.draft || configKey(this.draft) === this.baseline)
            this.draft = copy(saved);
        this.baseline = key;
    }

    edit(config: OverlayConfig) {
        if (this.busy || !app_state.ready) return;
        this.draft = copy(config);
        this.queueTestUpdate();
    }

    private sendTestUpdate = debounce(
        async (
            id: string,
            revision: number,
            config: OverlayConfig,
            text: string,
        ) => {
            if (
                overlay_test.obj.id !== id ||
                overlay_test.obj.expires_at_ms <= Date.now()
            )
                return;
            try {
                const accepted = await invoke<boolean>("update_overlay_test", {
                    id,
                    revision,
                    config,
                    text,
                });
                if (
                    !accepted &&
                    overlay_test.obj.id === id &&
                    overlay_test.obj.expires_at_ms > Date.now()
                ) {
                    throw new Error(
                        "The overlay test update was not accepted.",
                    );
                }
            } catch (error) {
                this.test_error = error;
            }
        },
        100,
    );

    queueTestUpdate() {
        const test = overlay_test.obj;
        if (!test.config || test.expires_at_ms <= Date.now()) return;
        this.revision = Math.max(this.revision, test.revision) + 1;
        this.sendTestUpdate(
            test.id,
            this.revision,
            copy(this.config),
            this.sample_text,
        );
    }

    async startTest() {
        if (this.test_busy) return;
        this.test_busy = true;
        this.test_error = null;
        try {
            const next = await invoke<OverlayTestState>("start_overlay_test", {
                config: copy(this.config),
                text: this.sample_text,
            });
            const current = overlay_test.obj;
            if (
                next.started_at_ms > current.started_at_ms ||
                (next.started_at_ms === current.started_at_ms &&
                    next.revision >= current.revision)
            )
                overlay_test.obj = next;
            this.revision = 0;
            this.queueTestUpdate();
        } finally {
            this.test_busy = false;
        }
    }

    async stopTest() {
        this.sendTestUpdate.cancel();
        const id = overlay_test.obj.id;
        if (!id || !overlay_test.obj.config) return;
        await invoke("stop_overlay_test", { id });
        if (overlay_test.obj.id === id && overlay_test.obj.config)
            overlay_test.obj = {
                ...overlay_test.obj,
                config: null,
                text: "",
                expires_at_ms: 0,
                revision: overlay_test.obj.revision + 1,
            };
    }

    async apply() {
        if (!this.dirty || this.busy || !app_state.ready) return;
        this.busy = true;
        const config = copy(this.config);
        try {
            const value = { ...copy(app_state.obj), overlay_config: config };
            const accepted = await invoke<boolean>("update_state", {
                state: {
                    version: null,
                    name: "app_state",
                    value: JSON.stringify(value),
                },
            });
            if (!accepted)
                throw new Error("The overlay configuration was not accepted.");
            app_state.obj.overlay_config = config;
            this.draft = copy(config);
            this.baseline = configKey(config);
            try {
                await this.stopTest();
            } catch (error) {
                this.test_error = error;
            }
        } finally {
            this.busy = false;
        }
    }

    async discard() {
        if (this.busy) return;
        this.draft = copy(app_state.obj.overlay_config);
        this.baseline = configKey(this.draft);
        await this.stopTest();
    }
}

export const overlay_editor = new OverlayEditor();
