import { invoke } from "@tauri-apps/api/core";
import type { SessionReset } from "$lib/bindings";
import { showHomeActionError, showSessionStartError } from "$lib/home-errors";
import { internal_state } from "$lib/stores/state.svelte";
import { session } from "$lib/stores/session.svelte";

class SessionActions {
    pending = $state<"start" | "stop" | "reset" | null>(null);
    private request = 0;
    private client_id = crypto.randomUUID();

    private commandRequest(sequence: number) {
        return { request: { client_id: this.client_id, sequence } };
    }

    get starting() {
        return (
            this.pending === "start" || internal_state.obj.transcribe_starting
        );
    }

    get stopping() {
        return this.pending === "stop" || this.pending === "reset";
    }

    async start() {
        if (
            this.pending ||
            this.starting ||
            internal_state.obj.transcribe_running
        )
            return;
        const request = ++this.request;
        this.pending = "start";
        try {
            await invoke("start_transcribe", this.commandRequest(request));
        } catch (error) {
            if (request === this.request) {
                showSessionStartError(error);
            }
        } finally {
            if (request === this.request) this.pending = null;
        }
    }

    async stop() {
        if (this.stopping) return;
        const request = ++this.request;
        this.pending = "stop";
        try {
            await invoke("stop_transcribe", this.commandRequest(request));
        } catch (error) {
            if (request === this.request) showHomeActionError("stop", error);
        } finally {
            if (request === this.request) this.pending = null;
        }
    }

    async reset() {
        if (this.stopping) return;
        const request = ++this.request;
        this.pending = "reset";
        try {
            const reset = await invoke<SessionReset>(
                "new_session",
                this.commandRequest(request),
            );
            if (request === this.request) session.reset(reset.revision);
        } catch (error) {
            if (request === this.request)
                showHomeActionError("new_session", error);
        } finally {
            if (request === this.request) this.pending = null;
        }
    }
}

export const session_actions = new SessionActions();
