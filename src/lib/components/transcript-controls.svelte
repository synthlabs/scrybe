<script lang="ts">
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import { onDestroy } from "svelte";
    import { Button } from "$lib/components/ui/button/index.ts";
    import type { AppState } from "$bindings/AppState";
    import Play from "lucide-svelte/icons/play";
    import LoaderCircle from "lucide-svelte/icons/loader-circle";
    import Pause from "lucide-svelte/icons/pause";
    import { invoke } from "@tauri-apps/api/core";

    let app_state = $state({} as AppState);
    let debounce = $state(true);
    let un_sub: UnlistenFn;

    const get_appstate = async () => {
        const state = (await invoke("get_appstate")) as AppState;
        console.log("state", state);
        app_state = state;
        debounce = false;
    };

    const subscribe_appstate = async () => {
        console.log("subbing to appstate");
        un_sub = await listen<AppState>("state_update", (event) => {
            app_state = event.payload;
        });
    };

    onDestroy(() => {
        console.log("unsubbing");
        un_sub();
    });

    const toggle_transcripts = () => {
        debounce = true;
        if (app_state.running) {
            console.log("Currently running, stopping...");
            invoke("stop_transcribe");
            app_state.running = false;
        } else {
            console.log("Currently NOT running, starting...");
            invoke("start_transcribe");
            app_state.running = true;
        }
        setTimeout(get_appstate, 1000);
    };

    get_appstate();
    subscribe_appstate();
</script>

<div class="flex gap-2 text-muted-foreground text-sm">
    {#if app_state.running}
        Lisening ({app_state.current_device.name})
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
        {#if app_state.running}
            <LoaderCircle class="animate-spin text-primary" />
        {:else}
            <Play />
        {/if}
    </Button>
</div>
