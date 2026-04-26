<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { SyncedState } from "tauri-svelte-synced-store";
    import { DefaultInternalState } from "$lib/defaults";
    import type { InternalState } from "$lib/bindings";

    const BAR_COUNT = 40;

    let internal_state = new SyncedState<InternalState>(
        "internal_state",
        DefaultInternalState,
    );
    let listening = $derived(internal_state.obj.transcribe_running);

    // TODO: replace mock heights with real RMS amplitude from a backend
    // `audio_meter` event (or piggyback on `segment_update`). Today the
    // bars are pure animation — they don't reflect actual input level.
    let heights = $state<number[]>(new Array(BAR_COUNT).fill(0.1));
    let interval: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        interval = setInterval(() => {
            if (listening) {
                heights = heights.map(() => 0.25 + Math.random() * 0.75);
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
