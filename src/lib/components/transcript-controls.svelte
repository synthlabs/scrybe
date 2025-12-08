<script lang="ts">
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import { onDestroy } from "svelte";
    import { Button } from "$lib/components/ui/button/index.ts";
    import type { AppState } from "$lib/bindings";
    import Play from "lucide-svelte/icons/play";
    import LoaderCircle from "lucide-svelte/icons/loader-circle";
    import Pause from "lucide-svelte/icons/pause";
    import { invoke } from "@tauri-apps/api/core";
    import { SyncedStore } from "$lib/store.svelte";
    import { DefaultAppState } from "$lib/defaults";

    let store = new SyncedStore<AppState>("appstate", DefaultAppState);
    store.init();

    let transcribe_running = $state(false);
    let debounce = $state(false);
    let disabled_state = $derived(debounce);

    $inspect(transcribe_running);

    let un_sub: UnlistenFn;

    onDestroy(() => {
        console.log("unsubbing - transcript controls");
        if (un_sub) {
            un_sub();
        }
    });

    const toggle_transcripts = () => {
        debounce = true;
        if (transcribe_running) {
            console.log("Currently running, stopping...");
            invoke("stop_transcribe");
        } else {
            console.log("Currently NOT running, starting...");
            invoke("start_transcribe");
        }
        setTimeout(() => (debounce = false), 1000);
    };

    let subscribe = async () => {
        console.log("subbing to appstate updates");
        un_sub = await listen<boolean>("transcribe_running", (event) => {
            console.log("transcribe_running event");
            transcribe_running = event.payload;
        });
    };

    subscribe();
</script>

<div class="flex gap-2 text-sm text-muted-foreground">
    {#if transcribe_running}
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
        disabled={disabled_state}
    >
        {#if transcribe_running}
            <LoaderCircle class="animate-spin text-primary" />
        {:else}
            <Play />
        {/if}
    </Button>
</div>
