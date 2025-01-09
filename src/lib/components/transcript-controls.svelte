<script lang="ts">
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import { onDestroy } from "svelte";
    import { Button } from "$lib/components/ui/button/index.ts";
    import type { AppState } from "$bindings/AppState";
    import Play from "lucide-svelte/icons/play";
    import LoaderCircle from "lucide-svelte/icons/loader-circle";
    import Pause from "lucide-svelte/icons/pause";
    import { invoke } from "@tauri-apps/api/core";
    import { SyncedStore } from "$lib/store.svelte";
    import { DefaultAppState } from "$bindings/defaults";

    let store = new SyncedStore<AppState>("appstate", DefaultAppState);
    store.init();

    let debounce = $state(false);

    onDestroy(() => {
        console.log("unsubbing - transcript controls");
        store.unsub();
    });

    const toggle_transcripts = () => {
        debounce = true;
        if (store.object.running) {
            console.log("Currently running, stopping...");
            invoke("stop_transcribe");
            store.object.running = false;
        } else {
            console.log("Currently NOT running, starting...");
            invoke("start_transcribe");
            store.object.running = true;
        }
        setTimeout(() => (debounce = false), 1000);
    };
</script>

<div class="flex gap-2 text-sm text-muted-foreground">
    {#if store.object.running}
        Lisening ({store.object.current_device.name})
    {:else}
        Not Listening
    {/if}
</div>
<div class="flex gap-2 px-4">
    <Button
        variant="outline"
        size="icon"
        onclick={toggle_transcripts}
        disabled={debounce}
    >
        {#if store.object.running}
            <LoaderCircle class="animate-spin text-primary" />
        {:else}
            <Play />
        {/if}
    </Button>
</div>
