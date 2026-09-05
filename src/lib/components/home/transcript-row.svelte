<script lang="ts">
    import type { WhisperSegment } from "$lib/bindings";
    import { fmt_segment_timestamp } from "$lib/stores/session.svelte";

    interface Props {
        segment: WhisperSegment;
        partial: boolean;
    }

    let { segment, partial }: Props = $props();

    let start_ms = $derived(segment.items[0]?.start_time ?? 0);
    let text = $derived(segment.items.map((item) => item.text).join(""));
</script>

<article class="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-4 py-3">
    <time
        class="text-muted-foreground pt-1 font-mono text-xs leading-5 tabular-nums"
    >
        {fmt_segment_timestamp(start_ms)}
    </time>
    <p class="text-foreground text-[0.9375rem] leading-6 break-words">
        {text || " "}
        {#if partial}<span
                class="text-scrybe animate-caret-blink ml-1 inline-block w-[1ch] motion-reduce:animate-none"
                aria-hidden="true">▌</span
            >{/if}
    </p>
</article>
