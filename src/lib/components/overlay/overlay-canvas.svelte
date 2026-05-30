<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { Input } from "$lib/components/ui/input/index.ts";
    import { Label } from "$lib/components/ui/label/index.ts";
    import * as Select from "$lib/components/ui/select/index.ts";
    import TextOverlay from "$lib/components/overlay/text-overlay.svelte";
    import type { OverlayBox, OverlayConfig } from "$lib/bindings";
    import {
        RESOLUTION_PRESETS,
        asFiniteNumber,
        clampBox,
        clampCanvas,
        resizeBox,
        resolutionPresetId,
    } from "$lib/overlay/layout-math.js";
    import { debounce } from "$lib/overlay/timing.js";
    import { m as msgs } from "$lib/paraglide/messages";

    interface Props {
        config: OverlayConfig;
        onChange: (next: OverlayConfig) => void;
        preview_text?: string;
        display_box?: OverlayBox;
    }

    type SafeZoneMode = "off" | "rule_of_thirds" | "lower_third";

    const HANDLES = [
        { mode: "nw", x: 0, y: 0, cursor: "nwse-resize", label: "NW" },
        { mode: "n", x: 0.5, y: 0, cursor: "ns-resize", label: "N" },
        { mode: "ne", x: 1, y: 0, cursor: "nesw-resize", label: "NE" },
        { mode: "e", x: 1, y: 0.5, cursor: "ew-resize", label: "E" },
        { mode: "se", x: 1, y: 1, cursor: "nwse-resize", label: "SE" },
        { mode: "s", x: 0.5, y: 1, cursor: "ns-resize", label: "S" },
        { mode: "sw", x: 0, y: 1, cursor: "nesw-resize", label: "SW" },
        { mode: "w", x: 0, y: 0.5, cursor: "ew-resize", label: "W" },
    ];
    const DRAG_COMMIT_MS = 100;

    let {
        config,
        onChange,
        preview_text = $bindable(msgs.overlay_test_text()),
        display_box = $bindable(config.box),
    }: Props = $props();

    let canvas_el: HTMLDivElement | undefined = $state();
    let draft_box: OverlayBox | null = $state(null);
    let scale = $state(1);
    let selected = $state(true);
    let safe_zone = $state<SafeZoneMode>("off");
    let resolution_id = $derived(resolutionPresetId(config.canvas));
    let resolution_label = $derived(
        resolution_id === "custom"
            ? `${msgs.overlay_resolution_custom()} · ${config.canvas.width} × ${config.canvas.height}`
            : (RESOLUTION_PRESETS.find((preset) => preset.id === resolution_id)
                  ?.label ?? ""),
    );
    let canvas_style = $derived(
        `aspect-ratio: ${config.canvas.width} / ${config.canvas.height};`,
    );
    let current_box = $derived(draft_box ?? config.box);
    let box_style = $derived(
        [
            `left: ${current_box.x * scale}px`,
            `top: ${current_box.y * scale}px`,
            `width: ${current_box.w * scale}px`,
            `height: ${current_box.h * scale}px`,
        ].join("; "),
    );
    let handle_size = $derived(Math.max(8, 14 * scale));
    let dash = $derived(config.canvas.width / 240);
    let stroke_width = $derived(Math.max(1, config.canvas.width / 1200));
    let lower_third_y = $derived(config.canvas.height * 0.72);
    let lower_third_h = $derived(config.canvas.height * 0.18);

    const measure = () => {
        if (!canvas_el) return;
        scale = canvas_el.clientWidth / config.canvas.width;
    };

    onMount(() => {
        measure();
        if (!canvas_el) return;

        const observer = new ResizeObserver(measure);
        observer.observe(canvas_el);

        return () => observer.disconnect();
    });

    $effect(() => {
        config.canvas.width;
        measure();
    });

    $effect(() => {
        display_box = current_box;
    });

    const commitBox = (box: OverlayBox) => {
        onChange({
            ...config,
            box: clampBox(box, config.canvas),
        });
    };
    const commitInteractionBox = debounce(commitBox, DRAG_COMMIT_MS);

    const updateBox = (box: OverlayBox) => {
        commitInteractionBox.cancel();
        draft_box = null;
        commitBox(box);
    };

    const updateCanvas = (width: number, height: number) => {
        commitInteractionBox.cancel();
        draft_box = null;
        const canvas = clampCanvas({ width, height });
        onChange({
            ...config,
            canvas,
            box: clampBox(config.box, canvas),
        });
    };

    const setResolution = (id: string) => {
        const preset = RESOLUTION_PRESETS.find((item) => item.id === id);
        if (!preset || preset.id === "custom") return;
        updateCanvas(preset.width, preset.height);
    };

    const beginInteraction = (event: PointerEvent, mode: string) => {
        event.preventDefault();
        event.stopPropagation();
        selected = true;

        const start_x = event.clientX;
        const start_y = event.clientY;
        const start_box = { ...(draft_box ?? config.box) };
        const start_scale = scale || 1;

        const onMove = (move_event: PointerEvent) => {
            const dx = (move_event.clientX - start_x) / start_scale;
            const dy = (move_event.clientY - start_y) / start_scale;
            const next_box = resizeBox(start_box, mode, dx, dy, config.canvas);
            draft_box = next_box;
            commitInteractionBox(next_box);
        };

        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            commitInteractionBox.flush();
            draft_box = null;
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    onDestroy(() => {
        commitInteractionBox.cancel();
    });
</script>

<div class="flex min-w-0 flex-col gap-3">
    <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-wrap items-end gap-3">
            <div class="flex min-w-52 flex-col gap-1.5">
                <Label
                    for="overlay-resolution"
                    class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                >
                    {msgs.overlay_canvas_label()}
                </Label>
                <Select.Root
                    type="single"
                    value={resolution_id}
                    onValueChange={setResolution}
                >
                    <Select.Trigger id="overlay-resolution" class="h-9">
                        {resolution_label}
                    </Select.Trigger>
                    <Select.Content>
                        {#each RESOLUTION_PRESETS as preset (preset.id)}
                            <Select.Item value={preset.id} label={preset.label}>
                                {preset.label}
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </div>

            {#if resolution_id === "custom"}
                <div class="grid grid-cols-2 gap-2">
                    <div class="flex flex-col gap-1.5">
                        <Label
                            for="overlay-custom-width"
                            class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                        >
                            {msgs.overlay_custom_width()}
                        </Label>
                        <Input
                            id="overlay-custom-width"
                            type="number"
                            min="200"
                            value={config.canvas.width}
                            class="h-9 w-24 font-mono text-xs"
                            oninput={(event: Event) =>
                                updateCanvas(
                                    asFiniteNumber(
                                        (event.currentTarget as HTMLInputElement)
                                            .value,
                                    ),
                                    config.canvas.height,
                                )}
                        />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <Label
                            for="overlay-custom-height"
                            class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                        >
                            {msgs.overlay_custom_height()}
                        </Label>
                        <Input
                            id="overlay-custom-height"
                            type="number"
                            min="60"
                            value={config.canvas.height}
                            class="h-9 w-24 font-mono text-xs"
                            oninput={(event: Event) =>
                                updateCanvas(
                                    config.canvas.width,
                                    asFiniteNumber(
                                        (event.currentTarget as HTMLInputElement)
                                            .value,
                                    ),
                                )}
                        />
                    </div>
                </div>
            {/if}

            <div class="flex min-w-40 flex-col gap-1.5">
                <Label
                    for="overlay-safe-zone"
                    class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                >
                    {msgs.overlay_safe_zone_label()}
                </Label>
                <Select.Root type="single" bind:value={safe_zone}>
                    <Select.Trigger id="overlay-safe-zone" class="h-9">
                        {safe_zone === "rule_of_thirds"
                            ? msgs.overlay_safe_zone_rule()
                            : safe_zone === "lower_third"
                              ? msgs.overlay_safe_zone_lower()
                              : msgs.overlay_safe_zone_off()}
                    </Select.Trigger>
                    <Select.Content>
                        <Select.Item value="off" label={msgs.overlay_safe_zone_off()}>
                            {msgs.overlay_safe_zone_off()}
                        </Select.Item>
                        <Select.Item
                            value="rule_of_thirds"
                            label={msgs.overlay_safe_zone_rule()}
                        >
                            {msgs.overlay_safe_zone_rule()}
                        </Select.Item>
                        <Select.Item
                            value="lower_third"
                            label={msgs.overlay_safe_zone_lower()}
                        >
                            {msgs.overlay_safe_zone_lower()}
                        </Select.Item>
                    </Select.Content>
                </Select.Root>
            </div>
        </div>
    </div>

    <div
        role="button"
        tabindex="0"
        class="relative w-full overflow-hidden rounded-md border border-border bg-overlay-checker text-left"
        style={canvas_style}
        onclick={() => (selected = false)}
        onkeydown={(event) => {
            if (event.key === "Escape") selected = false;
        }}
        bind:this={canvas_el}
        aria-label={msgs.overlay_canvas_label()}
    >
        <span
            class="absolute left-3 top-3 z-10 rounded border border-white/10 bg-black/55 px-2 py-0.5 font-mono text-[11px] text-white/70"
        >
            {config.canvas.width} × {config.canvas.height}
        </span>

        {#if safe_zone !== "off"}
            <svg
                class="pointer-events-none absolute inset-0 z-10 h-full w-full"
                viewBox="0 0 {config.canvas.width} {config.canvas.height}"
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                {#if safe_zone === "rule_of_thirds"}
                    <line
                        x1={config.canvas.width / 3}
                        y1="0"
                        x2={config.canvas.width / 3}
                        y2={config.canvas.height}
                        stroke="rgba(255,255,255,0.22)"
                        stroke-width={stroke_width}
                        stroke-dasharray="{dash} {dash}"
                    />
                    <line
                        x1={(config.canvas.width * 2) / 3}
                        y1="0"
                        x2={(config.canvas.width * 2) / 3}
                        y2={config.canvas.height}
                        stroke="rgba(255,255,255,0.22)"
                        stroke-width={stroke_width}
                        stroke-dasharray="{dash} {dash}"
                    />
                    <line
                        x1="0"
                        y1={config.canvas.height / 3}
                        x2={config.canvas.width}
                        y2={config.canvas.height / 3}
                        stroke="rgba(255,255,255,0.22)"
                        stroke-width={stroke_width}
                        stroke-dasharray="{dash} {dash}"
                    />
                    <line
                        x1="0"
                        y1={(config.canvas.height * 2) / 3}
                        x2={config.canvas.width}
                        y2={(config.canvas.height * 2) / 3}
                        stroke="rgba(255,255,255,0.22)"
                        stroke-width={stroke_width}
                        stroke-dasharray="{dash} {dash}"
                    />
                {:else}
                    <rect
                        x="0"
                        y={lower_third_y}
                        width={config.canvas.width}
                        height={lower_third_h}
                        fill="hsl(17 75% 65% / 0.10)"
                        stroke="rgba(255,255,255,0.35)"
                        stroke-width={stroke_width}
                        stroke-dasharray="{dash} {dash}"
                    />
                    <text
                        x={config.canvas.width / 2}
                        y={lower_third_y - config.canvas.height / 120}
                        text-anchor="middle"
                        font-size={Math.max(14, config.canvas.width / 90)}
                        letter-spacing="0.06em"
                        fill="rgba(255,255,255,0.55)"
                    >
                        LOWER THIRD
                    </text>
                {/if}
            </svg>
        {/if}

        <div
            role="button"
            tabindex="0"
            class:selected
            class="absolute z-20 cursor-grab touch-none overflow-visible outline outline-[1.5px] outline-scrybe/70 selected:outline-2 selected:outline-scrybe selected:shadow-[0_0_0_1px_rgba(0,0,0,0.6)] active:cursor-grabbing"
            style={box_style}
            onclick={(event) => event.stopPropagation()}
            onkeydown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selected = true;
                }
            }}
            onpointerdown={(event) => beginInteraction(event, "move")}
        >
            <TextOverlay
                test_mode={true}
                test_text={preview_text}
                style={config.style}
                {scale}
            />

            {#if selected}
                {#each HANDLES as handle (handle.mode)}
                    <button
                        type="button"
                        aria-label="Resize {handle.label}"
                        class="absolute z-30 rounded-[2px] border-[1.5px] border-[#0c0d10] bg-scrybe"
                        style="left: {handle.x * 100}%; top: {handle.y *
                            100}%; width: {handle_size}px; height: {handle_size}px; cursor: {handle.cursor}; transform: translate(-50%, -50%);"
                        onpointerdown={(event) =>
                            beginInteraction(event, handle.mode)}
                    ></button>
                {/each}
            {/if}
        </div>
    </div>

    <div class="flex min-w-0 items-center gap-3">
        <Label
            for="overlay-preview-text"
            class="text-muted-foreground shrink-0 text-[11px] font-semibold tracking-[0.04em] uppercase"
        >
            {msgs.overlay_preview_text_label()}
        </Label>
        <Input
            id="overlay-preview-text"
            bind:value={preview_text}
            class="h-9 min-w-0 flex-1 font-mono text-xs"
        />
    </div>
</div>

<style>
    .bg-overlay-checker {
        background-color: rgba(20, 22, 26, 0.55);
        background-image: conic-gradient(
            from 45deg,
            #2a2e36 0 25%,
            #1a1d23 0 50%,
            #2a2e36 0 75%,
            #1a1d23 0
        );
        background-size: 32px 32px;
    }
</style>
