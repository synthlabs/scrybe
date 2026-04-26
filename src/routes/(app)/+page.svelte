<script lang="ts">
    import Transcript from "$lib/components/transcript.svelte";
    import RightRail from "$lib/components/home/right-rail.svelte";
    import BottomToolbar from "$lib/components/home/bottom-toolbar.svelte";
    import SessionClock from "$lib/components/home/session-clock.svelte";
    import AudioWaveform from "$lib/components/home/audio-waveform.svelte";
    import HeaderChips from "$lib/components/home/header-chips.svelte";
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import { onMount, onDestroy } from "svelte";
    import { header } from "$lib/stores/header.svelte";

    onMount(() => {
        header.extras = headerExtras;
    });
    onDestroy(() => {
        if (header.extras === headerExtras) {
            header.extras = undefined;
        }
    });
</script>

{#snippet headerExtras()}
    <div class="flex items-center gap-2">
        <SessionClock />
        <AudioWaveform />
    </div>
    <!-- <Separator orientation="vertical" class="mx-1 h-4" /> -->
    <div class="flex grow"></div>
    <HeaderChips />
{/snippet}

<div class="flex min-h-0 flex-1 flex-col">
    <div class="flex min-h-0 flex-1">
        <Transcript />
        <RightRail />
    </div>
    <BottomToolbar />
</div>
