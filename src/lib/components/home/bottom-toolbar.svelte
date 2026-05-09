<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.ts";
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import Pause from "@lucide/svelte/icons/pause";
    import Play from "@lucide/svelte/icons/play";
    import Plus from "@lucide/svelte/icons/plus";
    import Copy from "@lucide/svelte/icons/copy";
    import Eraser from "@lucide/svelte/icons/eraser";
    import { invoke } from "@tauri-apps/api/core";
    import { toast } from "svelte-sonner";
    import Logger from "$utils/log";
    import { m as msgs } from "$lib/paraglide/messages";
    import { session, flat_text } from "$lib/stores/session.svelte";
    import { internal_state } from "$lib/stores/state.svelte";
    import { cn } from "$utils/cn";

    let listening = $derived(internal_state.obj.transcribe_running);

    let busy = $state(false);

    const toggle = async () => {
        if (busy) return;
        busy = true;
        try {
            if (listening) {
                await invoke("stop_transcribe");
            } else {
                await invoke("start_transcribe");
            }
        } catch (e) {
            Logger.error("toggle transcribe failed", e);
            toast.error(msgs.runtime_start_failed({ error: String(e) }));
        } finally {
            setTimeout(() => (busy = false), 600);
        }
    };

    const new_session = async () => {
        if (busy) return;
        busy = true;
        try {
            if (listening) await invoke("stop_transcribe");
            session.clear();
            await invoke("start_transcribe");
        } catch (e) {
            Logger.error("new session failed", e);
            toast.error(msgs.runtime_start_failed({ error: String(e) }));
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
        }
    };

    const clear_transcript = () => {
        if (session.segments.length === 0) return;
        session.clear_transcript();
    };

    let transcript_empty = $derived(session.segments.length === 0);
</script>

<div
    class="border-border bg-background/35 flex h-12 shrink-0 items-center gap-1 border-t px-3"
>
    <Button
        variant="ghost"
        size="sm"
        onclick={toggle}
        disabled={busy}
        class={cn(
            "h-8 cursor-pointer gap-1.5 transition-colors",
            listening
                ? "border border-scrybe/40 bg-background/35 text-scrybe-ring hover:bg-accent/35"
                : "hover:bg-accent/30 hover:text-scrybe",
        )}
    >
        {#if listening}
            <Pause class="size-3.5" />
            {msgs.home_toolbar_pause()}
        {:else}
            <Play class="text-scrybe/90 size-3.5" />
            {msgs.home_toolbar_resume()}
        {/if}
    </Button>
    <Separator orientation="vertical" class="mx-1 h-4" />
    <Button
        variant="ghost"
        size="sm"
        onclick={clear_transcript}
        disabled={transcript_empty}
        class="group text-muted-foreground h-8 gap-1.5 hover:bg-accent/30 hover:text-foreground"
    >
        <Eraser class="size-3.5 group-hover:text-scrybe/90" />
        {msgs.home_toolbar_clear_transcript()}
    </Button>
    <Button
        variant="ghost"
        size="sm"
        onclick={new_session}
        disabled={busy}
        class="group text-muted-foreground h-8 gap-1.5 hover:bg-accent/30 hover:text-foreground"
    >
        <Plus class="size-3.5 group-hover:text-scrybe/90" />
        {msgs.home_toolbar_new_session()}
    </Button>
    <Button
        variant="ghost"
        size="sm"
        onclick={copy}
        disabled={transcript_empty}
        class="group text-muted-foreground h-8 gap-1.5 hover:bg-accent/30 hover:text-foreground"
    >
        <Copy class="size-3.5 group-hover:text-scrybe/90" />
        {msgs.home_toolbar_copy()}
    </Button>
</div>
