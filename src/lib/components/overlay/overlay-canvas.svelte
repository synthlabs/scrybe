<script lang="ts">
    import { onMount } from "svelte";
    import type { OverlayConfig, OverlayLayout } from "$lib/bindings";
    import CaptionSample from "./caption-sample.svelte";
    import {
        anchorFactors,
        clampLayout,
        placementStyle,
    } from "$lib/overlay/placement.js";
    import { m as msgs } from "$lib/paraglide/messages";
    let {
        config,
        onChange,
        text,
        guides = "off",
        disabled = false,
    }: {
        config: OverlayConfig;
        onChange: (config: OverlayConfig) => void;
        text: string;
        guides?: string;
        disabled?: boolean;
    } = $props();
    let element: HTMLDivElement;
    let width = $state(640);
    let drag: {
        id: number;
        mode: string;
        x: number;
        y: number;
        layout: OverlayLayout;
    } | null = $state(null);
    const scale = $derived(width / config.canvas.width);
    const factors = $derived(anchorFactors(config.layout.anchor));
    const region_left = $derived(
        config.layout.x - config.layout.max_width * factors.x,
    );
    onMount(() => {
        const observer = new ResizeObserver(
            () => (width = element.clientWidth),
        );
        observer.observe(element);
        width = element.clientWidth;
        return () => observer.disconnect();
    });
    function update(layout: OverlayLayout) {
        if (!disabled)
            onChange({ ...config, layout: clampLayout(layout, config.canvas) });
    }
    function down(event: PointerEvent, mode: string) {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget instanceof HTMLElement &&
            event.currentTarget.setPointerCapture(event.pointerId);
        drag = {
            id: event.pointerId,
            mode,
            x: event.clientX,
            y: event.clientY,
            layout: { ...config.layout },
        };
    }
    function move(event: PointerEvent) {
        if (!drag || drag.id !== event.pointerId) return;
        const dx = (event.clientX - drag.x) / scale;
        const dy = (event.clientY - drag.y) / scale;
        if (drag.mode === "move")
            update({
                ...drag.layout,
                x: drag.layout.x + dx,
                y: drag.layout.y + dy,
            });
        else {
            const start = drag.layout;
            const factor = anchorFactors(start.anchor).x;
            const left = start.x - start.max_width * factor;
            const right = left + start.max_width;
            const next_width = Math.max(
                200,
                start.max_width + dx * (drag.mode === "right" ? 1 : -1),
            );
            update({
                ...start,
                max_width: next_width,
                x:
                    drag.mode === "right"
                        ? left + next_width * factor
                        : right - next_width * (1 - factor),
            });
        }
    }
    function key(event: KeyboardEvent, mode: string) {
        const amount = event.shiftKey ? 10 : 1;
        const deltas: Record<string, [number, number]> = {
            ArrowLeft: [-amount, 0],
            ArrowRight: [amount, 0],
            ArrowUp: [0, -amount],
            ArrowDown: [0, amount],
        };
        const delta = deltas[event.key];
        if (!delta) return;
        event.preventDefault();
        if (mode === "move")
            update({
                ...config.layout,
                x: config.layout.x + delta[0],
                y: config.layout.y + delta[1],
            });
        else
            update({
                ...config.layout,
                max_width: config.layout.max_width + delta[0],
            });
    }
</script>

<div
    class="canvas-stage"
    bind:this={element}
    style:aspect-ratio={`${config.canvas.width} / ${config.canvas.height}`}
>
    <div
        class="stream-plane"
        style:width={config.canvas.width + "px"}
        style:height={config.canvas.height + "px"}
        style:transform={`scale(${scale})`}
    >
        {#if guides !== "off"}
            <div
                class:thirds={guides === "rule_of_thirds"}
                class:lower={guides === "lower_third"}
                class="guide"
                aria-hidden="true"
            ></div>
        {/if}
        <div
            role="button"
            tabindex={disabled ? -1 : 0}
            aria-label={msgs.overlay_move_caption()}
            aria-disabled={disabled}
            class="caption-position"
            style={placementStyle(config.layout)}
            onpointerdown={(event) => down(event, "move")}
            onpointermove={move}
            onpointerup={() => (drag = null)}
            onpointercancel={() => (drag = null)}
            onlostpointercapture={() => (drag = null)}
            onkeydown={(event) => key(event, "move")}
        >
            <CaptionSample
                {text}
                style={config.style}
                max_width={config.layout.max_width}
            />
        </div>
        <div
            class="width-guide"
            style:left={region_left + "px"}
            style:top={config.layout.y + "px"}
            style:width={config.layout.max_width + "px"}
            aria-hidden="true"
        ></div>
        {#each ["left", "right"] as side}
            <button
                type="button"
                class="width-handle"
                {disabled}
                aria-label={msgs.overlay_resize_width()}
                style:left={region_left +
                    (side === "right" ? config.layout.max_width : 0) +
                    "px"}
                style:top={config.layout.y + "px"}
                style:width={32 / scale + "px"}
                style:height={32 / scale + "px"}
                onpointerdown={(event) => down(event, side)}
                onpointermove={move}
                onpointerup={() => (drag = null)}
                onpointercancel={() => (drag = null)}
                onlostpointercapture={() => (drag = null)}
                onkeydown={(event) => key(event, side)}
            >
                <span
                    style:width={4 / scale + "px"}
                    style:height={16 / scale + "px"}
                ></span>
            </button>
        {/each}
    </div>
</div>

<style>
    .canvas-stage {
        width: 100%;
        position: relative;
        overflow: hidden;
        border: 1px solid transparent;
    }
    .stream-plane {
        position: absolute;
        inset: 0;
        transform-origin: top left;
    }
    .caption-position {
        position: absolute;
        cursor: grab;
        touch-action: none;
        outline: 2px dashed var(--scrybe-color-brand);
        outline-offset: 4px;
        min-width: 2rem;
        min-height: 2rem;
    }
    .caption-position:active {
        cursor: grabbing;
    }
    .caption-position:focus-visible {
        outline-style: solid;
    }
    .width-guide {
        position: absolute;
        height: 1px;
        background: var(--scrybe-color-brand);
        pointer-events: none;
    }
    .width-handle {
        position: absolute;
        display: grid;
        place-items: center;
        transform: translate(-50%, -50%);
        cursor: ew-resize;
        touch-action: none;
        border: 0;
        background: transparent;
    }
    .width-handle span {
        background: var(--scrybe-color-brand);
        border-radius: 2px;
    }
    .width-handle:focus-visible {
        outline: 2px solid var(--scrybe-color-brand);
        outline-offset: 2px;
    }
    .guide {
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.65;
    }
    .thirds {
        background:
            linear-gradient(
                to right,
                transparent calc(100% / 3 - 1px),
                white calc(100% / 3),
                transparent calc(100% / 3 + 1px),
                transparent calc(200% / 3 - 1px),
                white calc(200% / 3),
                transparent calc(200% / 3 + 1px)
            ),
            linear-gradient(
                to bottom,
                transparent calc(100% / 3 - 1px),
                white calc(100% / 3),
                transparent calc(100% / 3 + 1px),
                transparent calc(200% / 3 - 1px),
                white calc(200% / 3),
                transparent calc(200% / 3 + 1px)
            );
    }
    .lower {
        inset: 72% 0 10%;
        border-block: 2px dashed white;
    }
</style>
