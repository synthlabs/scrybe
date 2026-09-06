<script lang="ts">
    import { onMount } from "svelte";
    import { MediaQuery } from "svelte/reactivity";
    import type { OverlayStyle } from "$lib/bindings";
    import TextOverlay from "./text-overlay.svelte";
    import { sampleFrame } from "$lib/overlay/sample.js";

    let {
        text,
        style,
        max_width,
        scale = 1,
        started_at_ms,
        animate = true,
    }: {
        text: string;
        style: OverlayStyle;
        max_width: number;
        scale?: number;
        started_at_ms?: number;
        animate?: boolean;
    } = $props();
    const reduced_motion = new MediaQuery("(prefers-reduced-motion: reduce)");
    const started = Date.now();
    let now = $state(started);
    onMount(() => {
        const timer = setInterval(() => (now = Date.now()), 180);
        return () => clearInterval(timer);
    });
    const frame = $derived(
        sampleFrame(
            text,
            now - (started_at_ms ?? started),
            reduced_motion.current || !animate,
        ),
    );
</script>

<TextOverlay {style} {max_width} {scale} test_mode test_text={frame} />
