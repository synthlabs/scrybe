<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.ts";
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import Pause from "@lucide/svelte/icons/pause";
    import Play from "@lucide/svelte/icons/play";
    import Plus from "@lucide/svelte/icons/plus";
    import Copy from "@lucide/svelte/icons/copy";
    import { invoke } from "@tauri-apps/api/core";
    import { toast } from "svelte-sonner";
    import { SyncedState } from "tauri-svelte-synced-store";
    import { DefaultInternalState } from "$lib/defaults";
    import type { InternalState } from "$lib/bindings";
    import Logger from "$utils/log";
    import { m as msgs } from "$lib/paraglide/messages";
    import { session, flat_text } from "$lib/stores/session.svelte";
    import { cn } from "$utils/cn";

    let internal_state = new SyncedState<InternalState>(
        "internal_state",
        DefaultInternalState,
    );
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

    let copy_disabled = $derived(session.segments.length === 0);
</script>

<div
    class="border-border bg-card/40 flex h-12 shrink-0 items-center gap-1 border-t px-3"
>
    <Button
        variant="ghost"
        size="sm"
        onclick={toggle}
        disabled={busy}
        class={cn(
            "h-8 cursor-pointer gap-1.5 transition-colors",
            listening
                ? "bg-scrybe hover:bg-scrybe-press text-primary-foreground"
                : "hover:bg-scrybe-soft hover:text-scrybe",
        )}
    >
        {#if listening}
            <Pause class="text-primary-foreground size-3.5 " />
            {msgs.home_toolbar_pause()}
        {:else}
            <Play class="text-scrybe size-3.5" />
            {msgs.home_toolbar_resume()}
        {/if}
    </Button>
    <Separator orientation="vertical" class="mx-1 h-4" />
    <Button
        variant="ghost"
        size="sm"
        onclick={new_session}
        disabled={busy}
        class="h-8 gap-1.5"
    >
        <Plus class="size-3.5" />
        {msgs.home_toolbar_new_session()}
    </Button>
    <Button
        variant="ghost"
        size="sm"
        onclick={copy}
        disabled={copy_disabled}
        class="h-8 gap-1.5"
    >
        <Copy class="size-3.5" />
        {msgs.home_toolbar_copy()}
    </Button>
</div>
