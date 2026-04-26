<script lang="ts">
    import SegmentCard from "$lib/components/home/segment-card.svelte";
    import { SyncedState } from "tauri-svelte-synced-store";
    import { DefaultAppState } from "$lib/defaults";
    import type { AppState, WhisperSegment } from "$lib/bindings";
    import { session } from "$lib/stores/session.svelte";
    import { m as msgs } from "$lib/paraglide/messages";

    let app_state = new SyncedState<AppState>("app_state", DefaultAppState);
    let segment_size = $derived(app_state.obj.audio_segment_size || 15);

    const minute_of = (seg: WhisperSegment, size_s: number): number =>
        Math.floor((seg.index * size_s) / 60);

    const pad2 = (n: number) => n.toString().padStart(2, "0");

    let groups = $derived.by(() => {
        const segs = session.segments;
        const acc: { minute: number; segments: WhisperSegment[] }[] = [];
        for (const seg of segs) {
            const m = minute_of(seg, segment_size);
            const last = acc[acc.length - 1];
            if (last && last.minute === m) {
                last.segments.push(seg);
            } else {
                acc.push({ minute: m, segments: [seg] });
            }
        }
        return acc;
    });

    let partial_id = $derived(session.partial_id);

    let container: HTMLDivElement | null = $state(null);

    $effect(() => {
        // depend on total character count so partial-segment growth also scrolls
        const _ = session.segments.reduce(
            (a, s) =>
                a + s.items.reduce((b, i) => b + i.text.length, 0),
            0,
        );
        if (container) {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: "smooth",
            });
        }
    });
</script>

<div
    bind:this={container}
    class="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3"
>
    {#each groups as group (group.minute)}
        <h3
            class="mt-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70 first:mt-0"
        >
            {msgs.home_minute_label({ minute: pad2(group.minute) })}
        </h3>
        {#each group.segments as seg (seg.id)}
            <SegmentCard
                segment={seg}
                partial={seg.id === partial_id}
            />
        {/each}
    {/each}
</div>
