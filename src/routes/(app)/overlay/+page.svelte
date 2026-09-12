<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { toast } from "svelte-sonner";
    import { Button } from "$lib/components/ui/button/index.ts";
    import { Input } from "$lib/components/ui/input/index.ts";
    import { Label } from "$lib/components/ui/label/index.ts";
    import { Slider } from "$lib/components/ui/slider/index.ts";
    import * as Select from "$lib/components/ui/select/index.ts";
    import * as Sheet from "$lib/components/ui/sheet/index.ts";
    import AlignButtons from "$lib/components/overlay/align-buttons.svelte";
    import ColorSwatches from "$lib/components/overlay/color-swatches.svelte";
    import IconOption from "$lib/components/overlay/icon-option.svelte";
    import Disclosure from "$lib/components/overlay/disclosure.svelte";
    import PreviewCanvas from "$lib/components/overlay/preview-canvas.svelte";
    import PreviewFrame from "$lib/components/overlay/preview-frame.svelte";
    import OverlayCanvas from "$lib/components/overlay/overlay-canvas.svelte";
    import TextOverlay from "$lib/components/overlay/text-overlay.svelte";
    import { Panel } from "$lib/components/ui/panel/index.ts";
    import Move from "@lucide/svelte/icons/move";
    import Palette from "@lucide/svelte/icons/palette";
    import type {
        OverlayConfig,
        OverlayStyle,
        OverlayLayout,
    } from "$lib/bindings";
    import { app_state } from "$lib/stores/state.svelte";
    import {
        overlay_editor as editor,
        overlay_test,
    } from "$lib/stores/overlay-editor.svelte";
    import {
        ANCHORS,
        clampLayout,
        defaultLayout,
        snapLayout,
    } from "$lib/overlay/placement.js";
    import {
        RESOLUTION_PRESETS,
        clampCanvas,
        resolutionPresetId,
    } from "$lib/overlay/layout-math.js";
    import {
        STYLE_PRESETS,
        BACKGROUND_SWATCHES,
        matchingPreset,
        applyPreset,
        pairedColor,
    } from "$lib/overlay/presets.js";
    import { showActionError } from "$lib/home-errors";
    import Copy from "@lucide/svelte/icons/copy";
    import Check from "@lucide/svelte/icons/check";
    import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
    import { m as msgs } from "$lib/paraglide/messages";

    const URL = "http://localhost:3030/app/v1/overlay";
    let setup_open = $state(false);
    let copied = $state(false);
    let now = $state(Date.now());
    let custom_resolution = $state(false);
    let guides = $state("off");
    let footer_height = $state(0);
    let window_height = $state(0);
    let copy_timer: ReturnType<typeof setTimeout>;
    const config = $derived(editor.config);
    const disabled = $derived(!app_state.ready || editor.busy);
    const preset = $derived(matchingPreset(config.style));
    const testing = $derived(
        overlay_test.obj.config !== null &&
            overlay_test.obj.expires_at_ms > now,
    );
    const remaining = $derived(
        Math.max(0, Math.ceil((overlay_test.obj.expires_at_ms - now) / 1000)),
    );
    const resolution = $derived(
        custom_resolution ? "custom" : resolutionPresetId(config.canvas),
    );
    const preset_labels: Record<string, () => string> = {
        classic: msgs.overlay_preset_classic,
        outline: msgs.overlay_preset_outline,
        solid: msgs.overlay_preset_solid,
        light: msgs.overlay_preset_light,
        custom: msgs.overlay_preset_custom,
    };
    const anchor_labels = {
        top_left: msgs.overlay_anchor_top_left,
        top_center: msgs.overlay_anchor_top_center,
        top_right: msgs.overlay_anchor_top_right,
        middle_left: msgs.overlay_anchor_middle_left,
        middle_center: msgs.overlay_anchor_middle_center,
        middle_right: msgs.overlay_anchor_middle_right,
        bottom_left: msgs.overlay_anchor_bottom_left,
        bottom_center: msgs.overlay_anchor_bottom_center,
        bottom_right: msgs.overlay_anchor_bottom_right,
    };
    $effect(() => {
        if (!app_state.ready) return;
        const saved = $state.snapshot(app_state.obj.overlay_config);
        untrack(() => editor.reconcile(saved));
    });
    $effect(() => {
        const error = editor.test_error;
        if (error)
            untrack(() => {
                showActionError(
                    msgs.overlay_error_test,
                    msgs.overlay_error_test_help,
                    error,
                    "overlay_error_test",
                );
                editor.test_error = null;
            });
    });
    onMount(() => {
        if (!editor.sample_text) editor.sample_text = msgs.overlay_test_text();
        const timer = setInterval(() => (now = Date.now()), 200);
        return () => {
            clearInterval(timer);
            clearTimeout(copy_timer);
        };
    });
    function edit(next: OverlayConfig) {
        editor.edit(next);
    }
    function reset() {
        if (disabled) return;
        editor.reset();
        custom_resolution = false;
    }
    function style<K extends keyof OverlayStyle>(
        key: K,
        value: OverlayStyle[K],
    ) {
        edit({ ...config, style: { ...config.style, [key]: value } });
    }
    function layout(key: "x" | "y" | "max_width", value: number) {
        edit({
            ...config,
            layout: clampLayout(
                { ...config.layout, [key]: value },
                config.canvas,
            ),
        });
    }
    function canvas(width: number, height: number) {
        const next = clampCanvas({ width, height });
        edit({
            ...config,
            canvas: next,
            layout: clampLayout(config.layout, next),
        });
    }
    async function copyUrl() {
        try {
            await navigator.clipboard.writeText(URL);
            copied = true;
            clearTimeout(copy_timer);
            copy_timer = setTimeout(() => (copied = false), 1500);
        } catch (error) {
            showActionError(
                msgs.overlay_error_copy,
                msgs.overlay_error_copy_help,
                error,
                "overlay_error_copy",
            );
        }
    }
    async function apply() {
        try {
            await editor.apply();
            toast.success(msgs.overlay_applied());
        } catch (error) {
            showActionError(
                msgs.overlay_error_apply,
                msgs.overlay_error_apply_help,
                error,
                "overlay_error_apply",
            );
        }
    }
    async function testAction() {
        try {
            if (testing) await editor.stopTest();
            else await editor.startTest();
        } catch (error) {
            showActionError(
                msgs.overlay_error_test,
                msgs.overlay_error_test_help,
                error,
                "overlay_error_test",
            );
        }
    }
    async function discard() {
        try {
            await editor.discard();
        } catch (error) {
            showActionError(
                msgs.overlay_error_test,
                msgs.overlay_error_test_help,
                error,
                "overlay_error_test",
            );
        }
    }
</script>

{#snippet range(
    key: "font_size" | "background_opacity" | "stroke_width" | "border_radius",
    label: string,
    min: number,
    max: number,
    unit: string,
)}
    <div class="control-group">
        <Label for={`overlay-${key}`} class="control-label"
            ><span>{label}</span><span class="measurement"
                >{config.style[key]}{unit}</span
            ></Label
        >
        <Slider
            id={`overlay-${key}`}
            type="single"
            aria-label={label}
            value={config.style[key]}
            {min}
            {max}
            step={1}
            {disabled}
            onValueChange={(value) => style(key, value)}
        />
    </div>
{/snippet}

<svelte:window bind:innerHeight={window_height} />

<div class="overlay-page" data-overlay-editor>
    <div class="overlay-workspace">
        <div class="page-heading text-muted-foreground">
            <h1>{msgs.overlay_heading()}</h1>
            <div class="flex flex-wrap gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onclick={copyUrl}
                    aria-live="polite"
                >
                    {#if copied}<Check
                            class="size-4"
                        />{msgs.overlay_url_copied()}{:else}<Copy
                            class="size-4"
                        />{msgs.overlay_copy_url()}{/if}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    id="overlay-setup"
                    onclick={() => (setup_open = true)}
                    >{msgs.overlay_setup()}</Button
                >
            </div>
        </div>
        {#if !app_state.ready}<p
                role="status"
                class="text-muted-foreground text-sm"
            >
                {msgs.overlay_loading()}
            </p>{/if}
        <section
            class="preview-section"
            aria-label={msgs.overlay_style_preview()}
        >
            <PreviewFrame positioning={editor.position_open}>
                {#if editor.position_open}
                    <OverlayCanvas
                        {config}
                        text={editor.sample_text}
                        onChange={edit}
                        {guides}
                        {disabled}
                    />
                {:else}
                    <PreviewCanvas {config} text={editor.sample_text} />
                {/if}
            </PreviewFrame>
        </section>
        <Panel as="div" class="mt-5">
            <div class="preset-row">
                <Label for="overlay-preset">{msgs.overlay_preset()}</Label>
                <Select.Root
                    type="single"
                    value={preset}
                    {disabled}
                    onValueChange={(value) =>
                        edit({
                            ...config,
                            style: applyPreset(config.style, value),
                        })}
                >
                    <Select.Trigger id="overlay-preset" class="w-full sm:w-56"
                        >{preset_labels[preset]()}</Select.Trigger
                    >
                    <Select.Content>
                        {#if preset === "custom"}<Select.Item
                                value="custom"
                                label={msgs.overlay_preset_custom()}
                                disabled
                                >{msgs.overlay_preset_custom()}</Select.Item
                            >{/if}
                        {#each STYLE_PRESETS as item}
                            <Select.Item
                                value={item.id}
                                label={preset_labels[item.id]()}
                            >
                                <span class="preset-option"
                                    ><span>{preset_labels[item.id]()}</span
                                    ><span class="preset-sample"
                                        ><TextOverlay
                                            test_mode
                                            test_text={msgs.overlay_preset_sample()}
                                            style={{
                                                ...config.style,
                                                ...item.style,
                                                font_size: 32,
                                            }}
                                            max_width={400}
                                            scale={0.4}
                                        /></span
                                    ></span
                                >
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </div>
            <div class="basic-controls">
                <div class="anchor-controls">
                    <span class="control-label"
                        >{msgs.overlay_anchor_label()}</span
                    >
                    <div
                        class="anchor-grid"
                        role="group"
                        aria-label={msgs.overlay_anchor_label()}
                    >
                        {#each ANCHORS as anchor, index}
                            <IconOption
                                label={anchor_labels[anchor]()}
                                selected={config.layout.anchor === anchor}
                                {disabled}
                                onclick={() =>
                                    edit({
                                        ...config,
                                        layout: snapLayout(
                                            config.canvas,
                                            anchor,
                                            config.layout.max_width,
                                        ),
                                    })}
                            >
                                <span
                                    class="anchor-cell"
                                    style:justify-content={[
                                        "flex-start",
                                        "center",
                                        "flex-end",
                                    ][index % 3]}
                                    style:align-items={[
                                        "flex-start",
                                        "center",
                                        "flex-end",
                                    ][Math.floor(index / 3)]}
                                    ><span></span></span
                                >
                            </IconOption>
                        {/each}
                    </div>
                </div>
                <div class="appearance-controls">
                    <div class="control-group">
                        <span class="control-label"
                            >{msgs.overlay_align_label()}</span
                        ><AlignButtons
                            value={config.style.align}
                            onChange={(value) => style("align", value)}
                            {disabled}
                        />
                    </div>
                    {@render range(
                        "font_size",
                        msgs.overlay_font_size_label(),
                        16,
                        96,
                        "px",
                    )}
                    <div class="control-group">
                        <span class="control-label"
                            >{msgs.overlay_background_color_label()}</span
                        ><ColorSwatches
                            value={config.style.background_color}
                            presets={BACKGROUND_SWATCHES}
                            label={msgs.overlay_background_color_label()}
                            allowCustom={false}
                            {disabled}
                            onChange={(value) =>
                                edit({
                                    ...config,
                                    style: pairedColor(config.style, value),
                                })}
                        />
                    </div>
                    {@render range(
                        "background_opacity",
                        msgs.overlay_opacity_label(),
                        0,
                        100,
                        "%",
                    )}
                </div>
            </div>
        </Panel>
        <Panel
            as="div"
            class="advanced-controls mt-6 overflow-hidden py-0 sm:py-0"
        >
            <Disclosure
                id="overlay-position-toggle"
                title={msgs.overlay_position_heading()}
                icon={Move}
                bind:open={editor.position_open}
            >
                <p class="text-muted-foreground text-sm leading-5">
                    {msgs.overlay_layout_help()}
                </p>
                <div class="settings-grid">
                    <div class="control-group">
                        <Label for="overlay-resolution"
                            >{msgs.overlay_canvas_label()}</Label
                        >
                        <Select.Root
                            type="single"
                            value={resolution}
                            {disabled}
                            onValueChange={(value) => {
                                custom_resolution = value === "custom";
                                const item = RESOLUTION_PRESETS.find(
                                    (p) => p.id === value,
                                );
                                if (item && !custom_resolution)
                                    canvas(item.width, item.height);
                            }}
                        >
                            <Select.Trigger id="overlay-resolution"
                                >{resolution === "custom"
                                    ? msgs.overlay_resolution_custom()
                                    : RESOLUTION_PRESETS.find(
                                          (p) => p.id === resolution,
                                      )?.label}</Select.Trigger
                            >
                            <Select.Content
                                >{#each RESOLUTION_PRESETS as item}<Select.Item
                                        value={item.id}
                                        label={item.id === "custom"
                                            ? msgs.overlay_resolution_custom()
                                            : item.label}
                                        >{item.id === "custom"
                                            ? msgs.overlay_resolution_custom()
                                            : item.label}</Select.Item
                                    >{/each}</Select.Content
                            >
                        </Select.Root>
                    </div>
                    <div class="control-group">
                        <Label for="overlay-guides"
                            >{msgs.overlay_safe_zone_label()}</Label
                        >
                        <Select.Root type="single" bind:value={guides}>
                            <Select.Trigger id="overlay-guides"
                                >{guides === "off"
                                    ? msgs.overlay_safe_zone_off()
                                    : guides === "lower_third"
                                      ? msgs.overlay_safe_zone_lower()
                                      : msgs.overlay_safe_zone_rule()}</Select.Trigger
                            >
                            <Select.Content
                                >{#each [{ id: "off", label: msgs.overlay_safe_zone_off }, { id: "rule_of_thirds", label: msgs.overlay_safe_zone_rule }, { id: "lower_third", label: msgs.overlay_safe_zone_lower }] as item}<Select.Item
                                        value={item.id}
                                        label={item.label()}
                                        >{item.label()}</Select.Item
                                    >{/each}</Select.Content
                            >
                        </Select.Root>
                    </div>
                    {#if resolution === "custom"}
                        <div class="control-group">
                            <Label for="overlay-canvas-width"
                                >{msgs.overlay_custom_width()}</Label
                            ><Input
                                id="overlay-canvas-width"
                                type="number"
                                min={200}
                                value={config.canvas.width}
                                {disabled}
                                oninput={(event) =>
                                    canvas(
                                        Number(event.currentTarget.value),
                                        config.canvas.height,
                                    )}
                            />
                        </div>
                        <div class="control-group">
                            <Label for="overlay-canvas-height"
                                >{msgs.overlay_custom_height()}</Label
                            ><Input
                                id="overlay-canvas-height"
                                type="number"
                                min={60}
                                value={config.canvas.height}
                                {disabled}
                                oninput={(event) =>
                                    canvas(
                                        config.canvas.width,
                                        Number(event.currentTarget.value),
                                    )}
                            />
                        </div>
                    {/if}
                    {#each [{ key: "max_width" as const, label: msgs.overlay_max_width }, { key: "x" as const, label: msgs.overlay_anchor_x }, { key: "y" as const, label: msgs.overlay_anchor_y }] as item}
                        <div class="control-group">
                            <Label for={`overlay-layout-${item.key}`}
                                >{item.label()}
                                <span class="measurement">px</span></Label
                            ><Input
                                id={`overlay-layout-${item.key}`}
                                type="number"
                                value={config.layout[item.key]}
                                {disabled}
                                oninput={(event) =>
                                    layout(
                                        item.key,
                                        Number(event.currentTarget.value),
                                    )}
                            />
                        </div>
                    {/each}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    class="w-fit"
                    {disabled}
                    onclick={() =>
                        edit({
                            ...config,
                            layout: defaultLayout(config.canvas),
                        })}
                    ><RotateCcw
                        class="size-4"
                    />{msgs.overlay_reset_position()}</Button
                >
            </Disclosure>
            <Disclosure
                id="overlay-styling-toggle"
                title={msgs.overlay_more_styling()}
                icon={Palette}
                bind:open={editor.styling_open}
            >
                <div class="settings-grid">
                    <div class="control-group">
                        <span class="control-label"
                            >{msgs.overlay_text_color_label()}</span
                        ><ColorSwatches
                            value={config.style.text_color}
                            presets={["#ffffff", "#000000", "#e98963"]}
                            customLabel={msgs.overlay_text_color_label()}
                            {disabled}
                            onChange={(value) => style("text_color", value)}
                        />
                    </div>
                    <div class="control-group">
                        <span class="control-label"
                            >{msgs.overlay_background_color_label()}</span
                        ><ColorSwatches
                            value={config.style.background_color}
                            presets={BACKGROUND_SWATCHES}
                            customLabel={msgs.overlay_background_color_label()}
                            {disabled}
                            onChange={(value) =>
                                style("background_color", value)}
                        />
                    </div>
                    {@render range(
                        "stroke_width",
                        msgs.overlay_outline_width_label(),
                        0,
                        12,
                        "px",
                    )}
                    <div class="control-group">
                        <span class="control-label"
                            >{msgs.overlay_outline_color_label()}</span
                        ><ColorSwatches
                            value={config.style.stroke_color}
                            presets={["#000000", "#ffffff", "#e98963"]}
                            customLabel={msgs.overlay_outline_color_label()}
                            {disabled}
                            onChange={(value) => style("stroke_color", value)}
                        />
                    </div>
                    {@render range(
                        "border_radius",
                        msgs.overlay_corner_label(),
                        0,
                        64,
                        "px",
                    )}
                    <div class="control-group">
                        <Label for="overlay-padding"
                            >{msgs.overlay_padding_label()}</Label
                        >
                        <Select.Root
                            type="single"
                            value={config.style.padding}
                            {disabled}
                            onValueChange={(value) =>
                                style(
                                    "padding",
                                    value as OverlayStyle["padding"],
                                )}
                        >
                            <Select.Trigger id="overlay-padding"
                                >{config.style.padding === "none"
                                    ? msgs.overlay_padding_none()
                                    : config.style.padding === "large"
                                      ? msgs.overlay_padding_large()
                                      : msgs.overlay_padding_normal()}</Select.Trigger
                            >
                            <Select.Content
                                >{#each [{ id: "none", label: msgs.overlay_padding_none }, { id: "normal", label: msgs.overlay_padding_normal }, { id: "large", label: msgs.overlay_padding_large }] as item}<Select.Item
                                        value={item.id}
                                        label={item.label()}
                                        >{item.label()}</Select.Item
                                    >{/each}</Select.Content
                            >
                        </Select.Root>
                    </div>
                </div>
            </Disclosure>
        </Panel>
    </div>
    <footer
        class="apply-bar"
        bind:clientHeight={footer_height}
        class:sticky={footer_height < window_height * 0.4}
    >
        <div class="footer-actions">
            <Button
                id="overlay-reset"
                variant="ghost"
                size="sm"
                class="max-w-full"
                {disabled}
                onclick={reset}
            >
                <RotateCcw class="size-4" aria-hidden="true" />
                <span class="min-w-0 wrap-anywhere"
                    >{msgs.overlay_reset_default()}</span
                >
            </Button>
            <div class="footer-commit-actions">
                <span
                    class="footer-status text-muted-foreground text-xs"
                    role="status"
                    >{editor.dirty ? msgs.overlay_unsaved() : ""}</span
                >
                <Button
                    id="overlay-discard"
                    variant="ghost"
                    size="sm"
                    disabled={disabled || editor.test_busy || !editor.dirty}
                    onclick={discard}>{msgs.overlay_discard()}</Button
                >
                <Button
                    id="overlay-apply"
                    variant="secondary"
                    size="sm"
                    disabled={disabled || editor.test_busy || !editor.dirty}
                    aria-busy={editor.busy}
                    onclick={apply}
                    >{editor.busy
                        ? msgs.overlay_applying()
                        : msgs.overlay_apply()}</Button
                >
            </div>
        </div>
    </footer>
</div>

<Sheet.Root bind:open={setup_open}>
    <Sheet.Content class="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <Sheet.Header class="pr-8"
            ><Sheet.Title>{msgs.overlay_setup()}</Sheet.Title><Sheet.Description
                >{msgs.overlay_setup_intro()}</Sheet.Description
            ></Sheet.Header
        >
        <ol class="setup-steps">
            <li>{msgs.overlay_setup_step1()}</li>
            <li>
                {msgs.overlay_setup_step2()}
                <div class="my-3 flex flex-wrap gap-2">
                    <code
                        class="rounded-md border p-2 text-xs break-all select-all"
                        >{URL}</code
                    ><Button variant="outline" size="sm" onclick={copyUrl}
                        >{copied
                            ? msgs.overlay_url_copied()
                            : msgs.overlay_copy_url()}</Button
                    >
                </div>
            </li>
            <li>
                {msgs.overlay_setup_step3()}
                <p class="mt-3 font-mono text-sm">
                    {config.canvas.width} × {config.canvas.height}
                </p>
                {#if editor.dirty}<p
                        class="text-muted-foreground mt-2 text-xs leading-5"
                    >
                        {msgs.overlay_setup_draft_dimensions()}
                    </p>{/if}
            </li>
            <li>{msgs.overlay_setup_step4()}</li>
        </ol>
        <section class="border-border grid gap-3 border-t pt-4">
            <Label for="overlay-test-text"
                >{msgs.overlay_test_text_label()}</Label
            >
            <Input
                id="overlay-test-text"
                value={editor.sample_text}
                oninput={(event) => {
                    editor.sample_text = event.currentTarget.value;
                    editor.queueTestUpdate();
                }}
            />
            <p class="text-muted-foreground text-sm leading-5">
                {msgs.overlay_test_help()}
            </p>
            <Button
                id="overlay-test"
                variant="outline"
                size="sm"
                class="w-fit"
                disabled={disabled ||
                    editor.test_busy ||
                    (!testing && !editor.sample_text.trim())}
                onclick={testAction}
                >{testing
                    ? msgs.overlay_stop_test()
                    : editor.dirty
                      ? msgs.overlay_test_changes()
                      : msgs.overlay_test()}</Button
            >
            {#if testing}<p class="text-muted-foreground text-xs">
                    {msgs.overlay_testing({ seconds: remaining })}
                </p>{/if}
        </section>
        <section class="border-border mt-2 border-t pt-4">
            <h2 class="text-sm font-medium">
                {msgs.overlay_troubleshooting()}
            </h2>
            <p class="text-muted-foreground mt-2 text-sm leading-6">
                {msgs.overlay_troubleshooting_body()}
            </p>
        </section>
    </Sheet.Content>
</Sheet.Root>

<style>
    .overlay-page {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 100%;
    }
    .overlay-workspace {
        container-type: inline-size;
        width: 100%;
        max-width: 58rem;
        margin: 0 auto;
        padding: 1.5rem;
    }
    .page-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 1rem;
        margin-bottom: 1.25rem;
    }
    h1 {
        font-size: 1.25rem;
        font-weight: 600;
    }
    .preset-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1.25rem;
    }
    .basic-controls {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 2rem;
    }
    .anchor-grid {
        display: grid;
        grid-template-columns: repeat(3, 2.25rem);
        gap: 0.25rem;
    }
    .anchor-cell {
        display: flex;
        width: 1.125rem;
        height: 1.125rem;
    }
    .anchor-cell span {
        width: 0.5rem;
        height: 0.25rem;
        background: currentColor;
        border-radius: 1px;
    }
    .appearance-controls,
    .settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
        gap: 1.25rem 1.5rem;
        align-items: start;
    }
    :global(.control-group) {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 0.5rem;
    }
    :global(.control-label) {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.25rem 0.5rem;
        color: var(--muted-foreground);
        font-size: 0.875rem;
        font-weight: 400;
    }
    .anchor-controls > .control-label {
        margin-bottom: 0.5rem;
    }
    :global(.measurement) {
        font-family: var(--scrybe-font-mono);
        font-size: 0.75rem;
        color: var(--muted-foreground);
    }
    .apply-bar {
        container: footer / inline-size;
        flex-shrink: 0;
        bottom: 0;
        z-index: 10;
        margin-top: auto;
        min-height: 3.25rem;
        padding: 0.5rem 0;
        border-top: 1px solid var(--border);
        background: var(--background);
    }
    .footer-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        padding: 0 1rem;
    }
    .footer-commit-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-left: auto;
    }
    @container footer (max-width: 32rem) {
        .footer-actions {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
        }
        .footer-commit-actions {
            display: contents;
        }
        .footer-status {
            grid-row: 1;
        }
        .footer-actions :global(button) {
            width: 100%;
            min-width: 0;
        }
    }
    .preset-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        width: 100%;
        min-height: 2rem;
    }
    .preset-sample {
        display: flex;
        justify-content: center;
        width: 6rem;
        padding: 0.25rem;
        border-radius: 0.25rem;
        background: #55585e;
    }
    .setup-steps {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        padding-left: 1.25rem;
        list-style: decimal;
        font-size: 0.875rem;
        line-height: 1.5;
    }
    @container (max-width:40rem) {
        .basic-controls {
            grid-template-columns: 1fr;
            gap: 1.25rem;
        }
    }
    @media (max-width: 32rem) {
        .overlay-workspace {
            padding: 1rem;
        }
        .basic-controls,
        .settings-grid {
            grid-template-columns: 1fr;
        }
        .preset-row {
            align-items: stretch;
            flex-direction: column;
            gap: 0.5rem;
        }
    }
</style>
