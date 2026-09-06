<script lang="ts">
    import { onMount } from "svelte";
    import type { OverlayConfig } from "$lib/bindings";
    import CaptionSample from "./caption-sample.svelte";
    import { anchorFactors } from "$lib/overlay/placement.js";
    import { m as msgs } from "$lib/paraglide/messages";
    let { config, text }: { config: OverlayConfig; text: string } = $props();
    let element: HTMLDivElement;
    let width = $state(640);
    const factors = $derived(anchorFactors(config.layout.anchor));
    const justify = $derived(
        ["flex-start", "center", "flex-end"][factors.x * 2],
    );
    const align = $derived(["flex-start", "center", "flex-end"][factors.y * 2]);
    onMount(() => {
        const measure = () => {
            const style = getComputedStyle(element);
            width =
                element.clientWidth -
                parseFloat(style.paddingLeft) -
                parseFloat(style.paddingRight);
        };
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        measure();
        return () => observer.disconnect();
    });
</script>

<div
    class="sample-stage"
    bind:this={element}
    style:justify-content={justify}
    style:align-items={align}
    aria-label={msgs.overlay_style_preview()}
>
    <CaptionSample
        {text}
        style={config.style}
        max_width={Math.max(1, Math.min(config.layout.max_width, width))}
    />
</div>

<style>
    .sample-stage {
        display: flex;
        min-height: 15rem;
        padding: 1rem;
        overflow: hidden;
        border: 1px solid transparent;
    }
</style>
