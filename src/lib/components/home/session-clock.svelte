<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { session, fmt_duration } from "$lib/stores/session.svelte";

    let now = $state(Date.now());
    let interval: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        interval = setInterval(() => {
            now = Date.now();
        }, 1000);
    });
    onDestroy(() => {
        if (interval) clearInterval(interval);
    });

    let elapsed = $derived(
        session.started_at !== null ? now - session.started_at : 0,
    );
</script>

<span class="font-mono text-[13px] font-semibold tabular-nums text-foreground">
    {fmt_duration(elapsed)}
</span>
