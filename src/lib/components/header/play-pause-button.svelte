<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.ts";
    import type { AppState, InternalState } from "$lib/bindings";
    import Play from "@lucide/svelte/icons/play";
    import LoaderCircle from "@lucide/svelte/icons/loader-circle";
    import Pause from "@lucide/svelte/icons/pause";
    import { invoke } from "@tauri-apps/api/core";
    import { SyncedState } from "tauri-svelte-synced-store";
    import { DefaultAppState, DefaultInternalState } from "$lib/defaults";
    import Logger from "$utils/log";
    import { cn } from "$lib/utils";

    let app_state = new SyncedState<AppState>("app_state", DefaultAppState);
    let internal_state = new SyncedState<InternalState>(
        "internal_state",
        DefaultInternalState,
    );

    let debounce = $state(false);
    let listening = $derived(internal_state.obj.transcribe_running);

    const toggle = () => {
        debounce = true;
        if (listening) {
            Logger.info("Currently running, stopping...");
            invoke("stop_transcribe");
        } else {
            Logger.info("Currently NOT running, starting...");
            invoke("start_transcribe");
        }
        setTimeout(() => (debounce = false), 1000);
    };
</script>

<Button
    variant="ghost"
    size="icon"
    onclick={toggle}
    disabled={debounce}
    class={cn(
        "h-8 w-8 transition-colors",
        listening
            ? "bg-scrybe text-primary-foreground hover:bg-scrybe-press"
            : "text-scrybe hover:bg-scrybe-soft hover:text-scrybe",
    )}
    aria-label={listening ? "Pause" : "Play"}
>
    {#if debounce}
        <LoaderCircle class="animate-spin" />
    {:else if listening}
        <Pause />
    {:else}
        <Play />
    {/if}
</Button>
