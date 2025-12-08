<script lang="ts">
    import { Toaster } from "$lib/components/ui/sonner/index.ts";
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import { onDestroy, onMount } from "svelte";
    import { toast } from "svelte-sonner";

    import "../app.css";

    let { children } = $props();

    // let un_sub: UnlistenFn;

    // onMount(async () => {
    //     console.log("subbing to appstate updates");
    //     un_sub = await listen<AppState>("appstate_update", (event) => {
    //         console.log("appstate_update", event.payload);

    //     });
    // });

    // onDestroy(() => {
    //     console.log("unsubbing");
    //     un_sub();
    // });
</script>

<Toaster />

<div class="h-full w-full">
    {@render children?.()}
</div>
