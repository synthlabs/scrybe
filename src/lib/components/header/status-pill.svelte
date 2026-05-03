<script lang="ts">
    import { m as msgs } from "$lib/paraglide/messages";
    import { internal_state } from "$lib/stores/state.svelte";

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
