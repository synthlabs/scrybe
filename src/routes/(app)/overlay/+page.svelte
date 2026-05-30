<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { Button } from "$lib/components/ui/button/index.ts";
    import { Input } from "$lib/components/ui/input/index.ts";
    import { Label } from "$lib/components/ui/label/index.ts";
    import { Slider } from "$lib/components/ui/slider/index.ts";
    import AlignButtons from "$lib/components/overlay/align-buttons.svelte";
    import ColorSwatches from "$lib/components/overlay/color-swatches.svelte";
    import OverlayCanvas from "$lib/components/overlay/overlay-canvas.svelte";
    import type { OverlayBox, OverlayConfig } from "$lib/bindings";
    import { header } from "$lib/stores/header.svelte";
    import { app_state, internal_state } from "$lib/stores/state.svelte";
    import { cn } from "$lib/utils";
    import {
        activeSnapZone,
        asFiniteNumber,
        clampBox,
        defaultBox,
        snapBoxToZone,
    } from "$lib/overlay/layout-math.js";
    import Copy from "@lucide/svelte/icons/copy";
    import Check from "@lucide/svelte/icons/check";
    import Info from "@lucide/svelte/icons/info";
    import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
    import Logger from "$utils/log";
    import { m as msgs } from "$lib/paraglide/messages";

    const OVERLAY_URL = "http://localhost:3030/app/v1/overlay";
    const TEST_OVERLAY_TIMEOUT_MS = 60_000;
    const GRID = [0, 1, 2];
    const TEXT_COLORS = ["#ffffff", "#f8d97a", "#a7f3d0", "#fda4af"];
    const BACKGROUND_COLORS = ["#000000", "#0c0d10", "#1f1f2e", "#3b2a1a"];
    const PADDING_OPTIONS: {
        value: OverlayConfig["style"]["padding"];
        label: string;
    }[] = [
        { value: "none", label: msgs.overlay_padding_none() },
        { value: "normal", label: msgs.overlay_padding_normal() },
        { value: "large", label: msgs.overlay_padding_large() },
    ];

    let config: OverlayConfig = $derived(app_state.obj.overlay_config);
    let active_zone = $derived(activeSnapZone(config.canvas, config.box));
    let preview_text = $state(msgs.overlay_test_text());
    let display_box: OverlayBox = $state(app_state.obj.overlay_config.box);
    let url_copied = $state(false);
    let url_copied_timer: ReturnType<typeof setTimeout> | null = null;
    let test_overlay_timer: ReturnType<typeof setTimeout> | null = null;
    let test_overlay_active = $derived(internal_state.obj.overlay_test.visible);

    const saveConfig = (next: OverlayConfig) => {
        app_state.obj.overlay_config = next;
        app_state.sync();
    };

    const updateBox = (box: OverlayBox) => {
        saveConfig({
            ...config,
            box: clampBox(box, config.canvas),
        });
    };

    const updateBoxNumber = (key: keyof OverlayBox, value: number) => {
        updateBox({
            ...config.box,
            [key]: asFiniteNumber(value),
        });
    };

    const updateStyle = <K extends keyof OverlayConfig["style"]>(
        key: K,
        value: OverlayConfig["style"][K],
    ) => {
        saveConfig({
            ...config,
            style: {
                ...config.style,
                [key]: value,
            },
        });
    };

    const clearTestOverlayTimer = () => {
        if (test_overlay_timer) {
            clearTimeout(test_overlay_timer);
            test_overlay_timer = null;
        }
    };

    const hideTestOverlay = () => {
        clearTestOverlayTimer();
        internal_state.obj.overlay_test = {
            visible: false,
            text: "",
            expires_at_ms: null,
        };
        internal_state.sync();
    };

    const scheduleTestOverlayExpiry = (expiresAtMs: number | null) => {
        clearTestOverlayTimer();
        if (!expiresAtMs) return;

        const delay = expiresAtMs - Date.now();
        if (delay <= 0) {
            hideTestOverlay();
            return;
        }

        test_overlay_timer = setTimeout(hideTestOverlay, delay);
    };

    const showTestOverlay = () => {
        const expires_at_ms = Date.now() + TEST_OVERLAY_TIMEOUT_MS;
        internal_state.obj.overlay_test = {
            visible: true,
            text: preview_text,
            expires_at_ms,
        };
        internal_state.sync();
        scheduleTestOverlayExpiry(expires_at_ms);
    };

    const toggleTestOverlay = () => {
        if (test_overlay_active) {
            hideTestOverlay();
        } else {
            showTestOverlay();
        }
    };

    const copyUrl = async () => {
        try {
            await navigator.clipboard.writeText(OVERLAY_URL);
            url_copied = true;
            if (url_copied_timer) clearTimeout(url_copied_timer);
            url_copied_timer = setTimeout(() => (url_copied = false), 1200);
        } catch (error) {
            Logger.error("clipboard write failed", error);
        }
    };

    onMount(() => {
        header.extras_right = obsUrlPill;
        if (internal_state.obj.overlay_test.visible) {
            scheduleTestOverlayExpiry(
                internal_state.obj.overlay_test.expires_at_ms,
            );
        }
    });
    onDestroy(() => {
        if (header.extras_right === obsUrlPill) {
            header.extras_right = undefined;
        }
        if (url_copied_timer) clearTimeout(url_copied_timer);
        clearTestOverlayTimer();
    });
</script>

{#snippet obsUrlPill()}
    <button
        type="button"
        onclick={copyUrl}
        class="border-border/60 bg-background/40 hover:bg-accent/35 flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors"
    >
        <span class="bg-status-live size-1.5 rounded-full"></span>
        <span class="text-muted-foreground">:3030/app/v1/overlay</span>
    </button>
{/snippet}

<div class="product-scrybe flex w-full flex-col gap-6 p-7">
    <div class="flex max-w-[980px] flex-col gap-3 md:flex-row md:items-start">
        <h1 class="text-[22px] leading-tight font-semibold">
            {msgs.overlay_heading()}
        </h1>
        <p
            class="text-muted-foreground max-w-[720px] text-[13px] leading-5 md:pt-0.5"
        >
            {msgs.overlay_intro()}
        </p>
    </div>

    <div
        class="border-border bg-secondary text-muted-foreground flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-[13px]"
    >
        <Info class="size-4 shrink-0" />
        <button
            type="button"
            onclick={copyUrl}
            class="border-border bg-background text-foreground hover:bg-accent min-w-0 rounded border px-2 py-1 font-mono text-xs transition-colors"
        >
            {OVERLAY_URL}
        </button>
        <span class="min-w-0 flex-1">{msgs.overlay_browser_note()}</span>
        <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-8 shrink-0 px-2 text-xs"
            onclick={copyUrl}
        >
            {#if url_copied}
                <Check class="text-status-live size-3.5" />
                {msgs.overlay_url_copied_short()}
            {:else}
                <Copy class="size-3.5" />
                {msgs.overlay_url_copy()}
            {/if}
        </Button>
    </div>

    <div class="bg-border h-px"></div>

    <div class="overlay-layout min-w-0 gap-7">
        <div class="flex min-w-0 flex-col gap-5">
            <OverlayCanvas
                {config}
                onChange={saveConfig}
                bind:preview_text
                bind:display_box
            />

            <section class="flex flex-row gap-3">
                <div class="flex flex-col gap-3">
                    <div class="flex flex-col gap-1.5">
                        <div class="flex flex-wrap items-baseline">
                            <h2 class="text-sm font-semibold">
                                {msgs.overlay_position_heading()}
                            </h2>
                            <p class="text-muted-foreground text-xs leading-5">
                                {msgs.overlay_position_desc()}
                            </p>
                        </div>
                    </div>

                    <div class="position-layout min-w-0 gap-4">
                        <div
                            class="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4"
                        >
                            {#each ["x", "y", "w", "h"] as key (key)}
                                <div class="flex min-w-0 flex-col gap-1.5">
                                    <Label
                                        for="overlay-box-{key}"
                                        class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                                    >
                                        {key}
                                    </Label>
                                    <div class="relative">
                                        <Input
                                            id="overlay-box-{key}"
                                            type="number"
                                            value={config.box[
                                                key as keyof OverlayBox
                                            ]}
                                            class="h-8 pr-7 font-mono text-xs"
                                            oninput={(event: Event) =>
                                                updateBoxNumber(
                                                    key as keyof OverlayBox,
                                                    asFiniteNumber(
                                                        (
                                                            event.currentTarget as HTMLInputElement
                                                        ).value,
                                                    ),
                                                )}
                                        />
                                        <span
                                            class="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px]"
                                        >
                                            px
                                        </span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>

                <div class="flex flex-row items-end gap-3 sm:justify-end">
                    <div class="flex flex-col gap-1.5">
                        <Label
                            class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                        >
                            {msgs.overlay_snap_to_zone()}
                        </Label>
                        <div
                            class="border-border grid w-[92px] grid-cols-3 gap-1 rounded-md border p-1"
                        >
                            {#each GRID as yi}
                                {#each GRID as xi}
                                    <button
                                        type="button"
                                        aria-label="Snap {xi + 1}, {yi + 1}"
                                        onclick={() =>
                                            updateBox(
                                                snapBoxToZone(
                                                    config.canvas,
                                                    config.box,
                                                    xi,
                                                    yi,
                                                ),
                                            )}
                                        class={cn(
                                            "h-4 rounded-sm transition-colors",
                                            active_zone?.xi === xi &&
                                                active_zone?.yi === yi
                                                ? "bg-scrybe"
                                                : "bg-accent hover:bg-accent/75",
                                        )}
                                    ></button>
                                {/each}
                            {/each}
                        </div>
                    </div>

                    <div class="flex flex-col gap-1.5">
                        <Button
                            type="button"
                            variant={test_overlay_active
                                ? "default"
                                : "secondary"}
                            size="sm"
                            class="h-8"
                            onclick={toggleTestOverlay}
                        >
                            {test_overlay_active
                                ? msgs.overlay_hide_test_overlay()
                                : msgs.overlay_show_test_overlay()}
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            class="h-8"
                            onclick={() => updateBox(defaultBox(config.canvas))}
                        >
                            <RotateCcw class="size-3.5" />
                            {msgs.overlay_reset_default()}
                        </Button>
                    </div>
                </div>
            </section>
        </div>

        <aside class="flex min-w-0 flex-col gap-6">
            <section class="flex flex-col gap-3">
                <div class="flex flex-col gap-0.5">
                    <h2 class="text-sm font-semibold">
                        {msgs.overlay_text_heading()}
                    </h2>
                    <p class="text-muted-foreground text-xs leading-5">
                        {msgs.overlay_text_desc()}
                    </p>
                </div>

                <div class="flex flex-col gap-1.5">
                    <Label
                        class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                    >
                        {msgs.overlay_align_label()}
                    </Label>
                    <AlignButtons
                        value={config.style.align}
                        onChange={(value) => updateStyle("align", value)}
                        ariaLabel={msgs.overlay_align_label()}
                    />
                </div>

                <div class="flex flex-col gap-1.5">
                    <div class="flex items-baseline justify-between">
                        <Label
                            for="overlay-font-size"
                            class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                        >
                            {msgs.overlay_font_size_label()} · {config.style
                                .font_size}px
                        </Label>
                    </div>
                    <Slider
                        id="overlay-font-size"
                        type="single"
                        value={config.style.font_size}
                        min={16}
                        max={96}
                        step={1}
                        class="max-w-[220px]"
                        onValueChange={(value) =>
                            updateStyle("font_size", value)}
                    />
                </div>

                <div class="flex flex-col gap-1.5">
                    <Label
                        class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                    >
                        {msgs.overlay_text_color_label()}
                    </Label>
                    <ColorSwatches
                        value={config.style.text_color}
                        presets={TEXT_COLORS}
                        customLabel={msgs.overlay_custom_color_label()}
                        onChange={(value) => updateStyle("text_color", value)}
                    />
                </div>
            </section>

            <section class="flex flex-col gap-3">
                <div class="flex flex-col gap-0.5">
                    <h2 class="text-sm font-semibold">
                        {msgs.overlay_background_heading()}
                    </h2>
                    <p class="text-muted-foreground text-xs leading-5">
                        {msgs.overlay_background_desc()}
                    </p>
                </div>

                <div class="flex flex-col gap-1.5">
                    <Label
                        class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                    >
                        {msgs.overlay_background_color_label()}
                    </Label>
                    <ColorSwatches
                        value={config.style.background_color}
                        presets={BACKGROUND_COLORS}
                        customLabel={msgs.overlay_custom_color_label()}
                        onChange={(value) =>
                            updateStyle("background_color", value)}
                    />
                </div>

                <div class="flex flex-col gap-1.5">
                    <Label
                        for="overlay-opacity"
                        class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                    >
                        {msgs.overlay_opacity_label()} · {config.style
                            .background_opacity}%
                    </Label>
                    <Slider
                        id="overlay-opacity"
                        type="single"
                        value={config.style.background_opacity}
                        min={0}
                        max={100}
                        step={1}
                        class="max-w-[240px]"
                        onValueChange={(value) =>
                            updateStyle("background_opacity", value)}
                    />
                </div>

                <div class="flex flex-col gap-1.5">
                    <Label
                        for="overlay-radius"
                        class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                    >
                        {msgs.overlay_corner_label()} · {config.style
                            .border_radius}px
                    </Label>
                    <Slider
                        id="overlay-radius"
                        type="single"
                        value={config.style.border_radius}
                        min={0}
                        max={64}
                        step={1}
                        class="max-w-[220px]"
                        onValueChange={(value) =>
                            updateStyle("border_radius", value)}
                    />
                </div>

                <div class="flex flex-col gap-1.5">
                    <Label
                        class="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase"
                    >
                        {msgs.overlay_padding_label()}
                    </Label>
                    <div
                        class="border-border inline-flex w-fit rounded-md border p-1"
                    >
                        {#each PADDING_OPTIONS as option (option.value)}
                            <button
                                type="button"
                                onclick={() =>
                                    updateStyle("padding", option.value)}
                                class={cn(
                                    "text-muted-foreground hover:bg-accent/45 hover:text-foreground h-7 rounded px-3 text-xs font-medium transition-colors",
                                    config.style.padding === option.value &&
                                        "bg-background text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]",
                                )}
                            >
                                {option.label}
                            </button>
                        {/each}
                    </div>
                </div>
            </section>
        </aside>
    </div>
</div>

<style>
    .overlay-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
    }

    .position-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
    }

    @media (min-width: 1100px) {
        .overlay-layout {
            grid-template-columns: minmax(0, 1fr) 360px;
        }

        .position-layout {
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: end;
        }
    }
</style>
