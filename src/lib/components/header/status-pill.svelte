<script lang="ts">
    import { m as msgs } from "$lib/paraglide/messages";
    import { internal_state } from "$lib/stores/state.svelte";

    let listening = $derived(internal_state.obj.transcribe_running);
</script>

<div
    role="status"
    class="text-muted-foreground flex items-center gap-2 text-sm font-medium"
>
    <span class="relative flex size-2 items-center justify-center">
        {#if listening}
            <span
                class="bg-status-live/35 animate-scrybe-pulse absolute inline-flex size-2 rounded-full motion-reduce:animate-none"
            ></span>
            <span
                class="bg-status-live relative inline-flex size-2 rounded-full"
            ></span>
        {:else}
            <span
                class="bg-status-idle relative inline-flex size-2 rounded-full"
            ></span>
        {/if}
    </span>
    <span>
        {listening ? msgs.header_status_listening() : msgs.header_status_idle()}
    </span>
</div>
