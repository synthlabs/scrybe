<script lang="ts">
    import { Label } from "$lib/components/ui/label/index.ts";
    import { Input } from "$lib/components/ui/input/index.ts";
    import { Slider } from "$lib/components/ui/slider/index.ts";
    import { Switch } from "$lib/components/ui/switch/index.ts";
    import ConsoleColumn from "$lib/components/console/console-column.svelte";
    import SegmentedControl from "$lib/components/console/segmented-control.svelte";
    import AlignButtons from "$lib/components/overlay/align-buttons.svelte";
    import ColorSwatches from "$lib/components/overlay/color-swatches.svelte";
    import PreviewCanvas from "$lib/components/overlay/preview-canvas.svelte";
    import Sliders from "@lucide/svelte/icons/sliders-horizontal";
    import Type from "@lucide/svelte/icons/type";
    import Globe from "@lucide/svelte/icons/globe";
    import Copy from "@lucide/svelte/icons/copy";
    import Check from "@lucide/svelte/icons/check";
    import type { OverlayConfig } from "$lib/bindings";
    import { toast } from "svelte-sonner";
    import Logger from "$utils/log";
    import { m as msgs } from "$lib/paraglide/messages";
    import { onMount, onDestroy } from "svelte";
    import { header } from "$lib/stores/header.svelte";
    import { app_state } from "$lib/stores/state.svelte";

    const OVERLAY_URL = "http://localhost:3030/app/v1/overlay";

    let config: OverlayConfig = $derived(app_state.obj.overlay_config);

    const update = <K extends keyof OverlayConfig>(
        key: K,
        value: OverlayConfig[K],
    ) => {
        app_state.obj.overlay_config[key] = value;
        app_state.sync();
    };

    const updatePadding = (v: number) => {
        update("padding_x", v);
        update("padding_y", v);
    };

    const WEIGHT_OPTIONS = [
        { value: "400", label: "Reg" },
        { value: "500", label: "Med" },
        { value: "600", label: "Semi" },
        { value: "700", label: "Bold" },
    ];

    let url_copied = $state(false);
    let url_copied_timer: ReturnType<typeof setTimeout> | null = null;
    const copy_url = async () => {
        try {
            await navigator.clipboard.writeText(OVERLAY_URL);
            url_copied = true;
            toast.success(msgs.overlay_url_copied());
            if (url_copied_timer) clearTimeout(url_copied_timer);
            url_copied_timer = setTimeout(() => (url_copied = false), 1400);
        } catch (e) {
            Logger.error("clipboard write failed", e);
        }
    };

    onMount(() => {
        header.extras_right = obsUrlPill;
    });
    onDestroy(() => {
        if (header.extras_right === obsUrlPill) {
            header.extras_right = undefined;
        }
    });
</script>

{#snippet obsUrlPill()}
    <div
        class="flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-2.5 py-1 font-mono text-[11px]"
    >
        <span class="size-1.5 rounded-full bg-status-live"></span>
        <span class="text-muted-foreground">:3030/app/v1/overlay</span>
    </div>
{/snippet}

<div class="flex w-full flex-col gap-4 p-4">
    <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold leading-tight">
            {msgs.overlay_heading()}
        </h1>
        <p class="text-sm text-muted-foreground">
            {msgs.overlay_intro()}
        </p>
    </div>

    <PreviewCanvas {config} />

    <div
        class="grid overflow-hidden rounded-md border bg-card"
        style="grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr);"
    >
        <ConsoleColumn icon={Sliders} label={msgs.overlay_column_layout()}>
            <div class="flex flex-col gap-1.5">
                <Label
                    class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                >
                    {msgs.overlay_align_label()}
                </Label>
                <AlignButtons
                    value={config.text_alignment}
                    onChange={(v) => update("text_alignment", v)}
                    ariaLabel={msgs.overlay_align_label()}
                />
            </div>

            <div class="flex flex-col gap-1.5">
                <Label
                    class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                >
                    {msgs.overlay_weight_label()}
                </Label>
                <SegmentedControl
                    options={WEIGHT_OPTIONS}
                    value={String(config.font_weight || 600)}
                    onChange={(v) => update("font_weight", Number(v))}
                    ariaLabel={msgs.overlay_weight_label()}
                />
            </div>

            <div class="flex flex-col gap-1.5">
                <div class="flex items-baseline justify-between">
                    <Label
                        for="bg-opacity"
                        class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                    >
                        {msgs.overlay_background_label()}
                    </Label>
                    <span class="text-xs font-mono text-foreground">
                        {config.transparency}%
                    </span>
                </div>
                <Slider
                    id="bg-opacity"
                    type="single"
                    value={config.transparency}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(v) => update("transparency", v)}
                />
                <div class="flex justify-between text-[10px] text-muted-foreground">
                    <span>{msgs.overlay_background_label_transparent()}</span>
                    <span>{msgs.overlay_background_label_opaque()}</span>
                </div>
            </div>

            <div class="flex flex-col gap-1.5">
                <div class="flex items-baseline justify-between">
                    <Label
                        for="corner-radius"
                        class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                    >
                        {msgs.overlay_corner_label()}
                    </Label>
                    <span class="text-xs font-mono text-foreground">
                        {config.corner_radius}px
                    </span>
                </div>
                <Slider
                    id="corner-radius"
                    type="single"
                    value={config.corner_radius}
                    min={0}
                    max={24}
                    step={1}
                    onValueChange={(v) => update("corner_radius", v)}
                />
                <div class="flex justify-between text-[10px] text-muted-foreground">
                    <span>{msgs.overlay_corner_label_square()}</span>
                    <span>{msgs.overlay_corner_label_pill()}</span>
                </div>
            </div>
        </ConsoleColumn>

        <ConsoleColumn icon={Type} label={msgs.overlay_column_text()}>
            <div class="flex flex-col gap-1.5">
                <div class="flex items-baseline justify-between">
                    <Label
                        for="font-size"
                        class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                    >
                        {msgs.overlay_font_size_label()}
                    </Label>
                    <span class="text-xs font-mono text-foreground">
                        {config.font_size}px
                    </span>
                </div>
                <Slider
                    id="font-size"
                    type="single"
                    value={config.font_size}
                    min={14}
                    max={56}
                    step={1}
                    onValueChange={(v) => update("font_size", v)}
                />
                <div class="flex justify-between text-[10px] text-muted-foreground">
                    <span>{msgs.overlay_font_size_label_compact()}</span>
                    <span>{msgs.overlay_font_size_label_cinematic()}</span>
                </div>
            </div>

            <div class="flex flex-col gap-1.5">
                <Label
                    class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                >
                    {msgs.overlay_color_label()}
                </Label>
                <ColorSwatches
                    value={config.background_color}
                    onChange={(v) => update("background_color", v)}
                />
            </div>

            <div class="flex flex-col gap-1.5">
                <div class="flex items-baseline justify-between">
                    <Label
                        class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                    >
                        {msgs.overlay_padding_label()}
                    </Label>
                    <span class="font-mono text-xs text-foreground">
                        {config.padding_x}px
                    </span>
                </div>
                <Slider
                    type="single"
                    value={config.padding_x}
                    min={0}
                    max={32}
                    step={1}
                    onValueChange={updatePadding}
                />
            </div>

            <div class="flex items-center justify-between rounded-md border border-transparent px-3 py-2 hover:bg-accent/40 transition-colors">
                <Label
                    for="drop-shadow"
                    class="cursor-pointer text-xs font-medium"
                >
                    {msgs.overlay_drop_shadow_label()}
                </Label>
                <Switch
                    id="drop-shadow"
                    checked={config.drop_shadow}
                    onCheckedChange={(v) => update("drop_shadow", v)}
                    class="scale-90"
                />
            </div>
        </ConsoleColumn>

        <ConsoleColumn icon={Globe} label={msgs.overlay_column_browser()}>
            <div class="flex flex-col gap-1.5">
                <Label
                    for="obs-url"
                    class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                >
                    {msgs.overlay_url_label()}
                </Label>
                <div class="relative">
                    <Input
                        id="obs-url"
                        type="text"
                        readonly
                        value={OVERLAY_URL}
                        class="h-9 pr-9 font-mono text-[11px]"
                    />
                    <button
                        type="button"
                        onclick={copy_url}
                        aria-label={msgs.overlay_url_copy_aria()}
                        class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:bg-accent"
                    >
                        {#if url_copied}
                            <Check class="size-3.5 text-status-live" />
                        {:else}
                            <Copy class="size-3.5" />
                        {/if}
                    </button>
                </div>
            </div>

            <div class="flex flex-col gap-1.5">
                <Label
                    class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                >
                    {msgs.overlay_howto_heading()}
                </Label>
                <ol
                    class="ml-4 list-decimal space-y-1 text-xs leading-snug text-muted-foreground marker:text-muted-foreground/60"
                >
                    <li>{msgs.overlay_howto_step1()}</li>
                    <li>{msgs.overlay_howto_step2()}</li>
                    <li>{msgs.overlay_howto_step3()}</li>
                </ol>
            </div>

            <div
                class="mt-auto flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground"
            >
                <span class="size-1.5 rounded-full bg-status-live"></span>
                <span>{msgs.overlay_server_running()}</span>
            </div>
        </ConsoleColumn>
    </div>
</div>
