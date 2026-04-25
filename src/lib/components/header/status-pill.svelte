<script lang="ts">
    import { SyncedState } from "tauri-svelte-synced-store";
    import { DefaultInternalState } from "$lib/defaults";
    import type { InternalState } from "$lib/bindings";
    import { m as msgs } from "$lib/paraglide/messages";

    let internal_state = new SyncedState<InternalState>(
        "internal_state",
        DefaultInternalState,
    );

    let listening = $derived(internal_state.obj.transcribe_running);
</script>

<div
    class="flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em]"
>
    <span class="relative flex h-2 w-2 items-center justify-center">
        {#if listening}
            <span
                class="absolute inline-flex h-2 w-2 rounded-full bg-status-live opacity-80 animate-scrybe-pulse"
            ></span>
            <span class="relative inline-flex h-2 w-2 rounded-full bg-status-live"></span>
        {:else}
            <span class="relative inline-flex h-2 w-2 rounded-full bg-status-idle"></span>
        {/if}
    </span>
    <span class="text-muted-foreground">
        {listening ? msgs.header_status_listening() : msgs.header_status_idle()}
    </span>
</div>
