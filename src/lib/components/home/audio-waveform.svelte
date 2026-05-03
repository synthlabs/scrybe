<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { audio_metrics, internal_state } from "$lib/stores/state.svelte";

    const BAR_COUNT = 40;

    let listening = $derived(internal_state.obj.transcribe_running);

    let heights = $state<number[]>(new Array(BAR_COUNT).fill(0.1));
    let interval: ReturnType<typeof setInterval> | null = null;

    function normalized_rms(rms: number) {
        if (!Number.isFinite(rms) || rms <= 0) return 0.1;
        return Math.min(1, Math.max(0.1, Math.sqrt(Math.min(1, rms * 12))));
    }

    onMount(() => {
        interval = setInterval(() => {
            if (listening) {
                heights = [
                    ...heights.slice(1),
                    normalized_rms(audio_metrics.obj.input_rms),
                ];
            } else if (heights.some((h) => h > 0.12)) {
                heights = new Array(BAR_COUNT).fill(0.1);
            }
        }, 600);
    });
    onDestroy(() => {
        if (interval) clearInterval(interval);
    });
</script>

<div
    class="flex h-[18px] items-end gap-[2px]"
    aria-hidden="true"
    role="presentation"
>
    {#each heights as h, i}
        {@const recent = i >= BAR_COUNT - 6}
        <div
            class="w-[2px] rounded-sm bg-scrybe transition-[height,opacity] duration-300"
            style="height: {Math.max(2, Math.round(h * 18))}px; opacity: {recent
                ? 1
                : Math.max(0.25, h)};"
        ></div>
    {/each}
</div>
