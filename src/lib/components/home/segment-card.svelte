<script lang="ts">
    import type { WhisperSegment } from "$lib/bindings";
    import { fmt_segment_timestamp } from "$lib/stores/session.svelte";
    import { cn } from "$lib/utils";

    interface Props {
        segment: WhisperSegment;
        partial: boolean;
    }

    let { segment, partial }: Props = $props();

    let start_ms = $derived(segment.items[0]?.start_time ?? 0);
    let text = $derived(segment.items.map((i) => i.text).join(""));
</script>

<article
    class={cn(
        "flex flex-col gap-1 rounded-md border px-3 py-2 transition-colors",
        partial
            ? "border-border/70 bg-background/45 shadow-[inset_2px_0_0_0_hsl(var(--c-scrybe))]"
            : "border-border/50 bg-background/25",
    )}
>
    <div class="flex items-baseline gap-2 text-[10px] text-muted-foreground">
        <span class="font-mono tabular-nums">
            {fmt_segment_timestamp(start_ms)}
        </span>
    </div>
    <p class="text-[13.5px] leading-snug text-foreground">
        {text || " "}
        {#if partial}<span
                class="text-scrybe/90 ml-0.5 inline-block w-[1ch] animate-caret-blink"
                aria-hidden="true">▌</span
            >{/if}
    </p>
</article>
