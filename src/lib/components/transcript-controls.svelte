<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.ts";
    import type { AppState, InternalState } from "$lib/bindings";
    import Play from "lucide-svelte/icons/play";
    import LoaderCircle from "lucide-svelte/icons/loader-circle";
    import Pause from "lucide-svelte/icons/pause";
    import { invoke } from "@tauri-apps/api/core";
    import { SyncedState } from "tauri-svelte-synced-store";
    import { DefaultAppState, DefaultInternalState } from "$lib/defaults";
    import Logger from "$utils/log";

    let app_state = new SyncedState<AppState>("app_state", DefaultAppState);
    let internal_state = new SyncedState<InternalState>(
        "internal_state",
        DefaultInternalState,
    );

    let debounce = $state(false);
    let disabled_state = $derived(debounce);

    $inspect(internal_state.obj.transcribe_running);

    const toggle_transcripts = () => {
        debounce = true;
        if (internal_state.obj.transcribe_running) {
            Logger.info("Currently running, stopping...");
            invoke("stop_transcribe");
        } else {
            Logger.info("Currently NOT running, starting...");
            invoke("start_transcribe");
        }
        setTimeout(() => (debounce = false), 1000);
    };
</script>

<div class="flex gap-2 text-sm text-muted-foreground">
    {#if internal_state.obj.transcribe_running}
        Lisening ({app_state.obj.current_device.name})
    {:else}
        Not Listening
    {/if}
</div>
<div class="flex gap-2 px-4">
    <Button
        variant="outline"
        size="icon"
        onclick={toggle_transcripts}
        disabled={disabled_state}
    >
        {#if internal_state.obj.transcribe_running}
            <LoaderCircle class="animate-spin text-primary" />
        {:else}
            <Play />
        {/if}
    </Button>
</div>
