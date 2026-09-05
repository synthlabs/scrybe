<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.ts";
    import Plus from "@lucide/svelte/icons/plus";
    import Copy from "@lucide/svelte/icons/copy";
    import Eraser from "@lucide/svelte/icons/eraser";
    import PanelRightClose from "@lucide/svelte/icons/panel-right-close";
    import PanelRightOpen from "@lucide/svelte/icons/panel-right-open";
    import { invoke } from "@tauri-apps/api/core";
    import { toast } from "svelte-sonner";
    import { showHomeActionError } from "$lib/home-errors";
    import Logger from "$utils/log";
    import { m as msgs } from "$lib/paraglide/messages";
    import { session, flat_text } from "$lib/stores/session.svelte";
    import { app_state, internal_state } from "$lib/stores/state.svelte";

    let listening = $derived(internal_state.obj.transcribe_running);
    let transcript_empty = $derived(session.segments.length === 0);
    let details_open = $derived(app_state.obj.home_right_rail.open);
    let busy = $state(false);

    const new_session = async () => {
        if (busy) return;
        busy = true;
        try {
            if (listening) await invoke("stop_transcribe");
            session.clear();
            await invoke("start_transcribe");
        } catch (e) {
            Logger.error("new session failed", e);
            showHomeActionError("new_session", e);
        } finally {
            setTimeout(() => (busy = false), 600);
        }
    };

    const copy = async () => {
        const text = flat_text(session.segments);
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            toast.success(msgs.home_toolbar_copied());
        } catch (e) {
            Logger.error("clipboard write failed", e);
            showHomeActionError("copy", e);
        }
    };

    const clear_transcript = () => {
        if (transcript_empty) return;
        session.clear_transcript();
    };

    const toggle_details = () => {
        app_state.obj.home_right_rail.open = !details_open;
        app_state.sync();
    };
</script>

<div
    class="border-border bg-background flex min-h-12 shrink-0 flex-wrap items-center gap-1 border-t px-3 py-2"
>
    <Button
        variant="ghost"
        size="sm"
        onclick={copy}
        disabled={transcript_empty}
        class="text-muted-foreground hover:text-foreground px-2"
    >
        <Copy class="size-4" />
        {msgs.home_toolbar_copy()}
    </Button>
    <Button
        variant="ghost"
        size="sm"
        onclick={new_session}
        disabled={busy}
        aria-busy={busy}
        class="text-muted-foreground hover:text-foreground px-2"
    >
        <Plus class="size-4" />
        {msgs.home_toolbar_new_session()}
    </Button>
    <Button
        variant="ghost"
        size="sm"
        onclick={clear_transcript}
        disabled={transcript_empty}
        class="text-muted-foreground hover:text-foreground px-2"
    >
        <Eraser class="size-4" />
        {msgs.home_toolbar_clear_transcript()}
    </Button>
    <div class="flex-1"></div>
    <Button
        variant="ghost"
        size="sm"
        id="home-details-toggle"
        onclick={toggle_details}
        aria-pressed={details_open}
        aria-expanded={details_open}
        aria-controls={details_open ? "home-details" : undefined}
        class="text-muted-foreground hover:text-foreground px-2"
    >
        {#if details_open}
            <PanelRightClose class="size-4" />
            {msgs.home_toolbar_close_details()}
        {:else}
            <PanelRightOpen class="size-4" />
            {msgs.home_toolbar_details()}
        {/if}
    </Button>
</div>
