<script lang="ts">
    import { Toaster } from "$lib/components/ui/sonner/index.ts";
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import { onDestroy, onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import Logger from "$utils/log";

    import "../app.css";

    let { children } = $props();

    // let un_sub: UnlistenFn;

    // onMount(async () => {
    //     Logger.debug("subbing to appstate updates");
    //     un_sub = await listen<AppState>("appstate_update", (event) => {
    //         Logger.debug("appstate_update", event.payload);

    //     });
    // });

    // onDestroy(() => {
    //     Logger.debug("unsubbing");
    //     un_sub();
    // });
</script>

<Toaster />

<div class="h-full w-full">
    {@render children?.()}
</div>
