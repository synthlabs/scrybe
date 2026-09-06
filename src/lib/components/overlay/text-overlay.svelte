<script lang="ts">
    import { onMount, tick } from "svelte";
    import type { OverlayStyle, WhisperSegment } from "$lib/bindings";
    import {
        captionFont,
        captionTextLayout,
        enclosedTransparentPixels,
    } from "$lib/overlay/canvas-text.js";
    import {
        DEFAULT_OVERLAY_CONFIG,
        hexToRgb,
    } from "$lib/overlay/layout-math.js";
    import { m as msgs } from "$lib/paraglide/messages";

    let {
        style = DEFAULT_OVERLAY_CONFIG.style,
        scale = 1,
        max_width = 1152,
        test_mode = false,
        test_text = msgs.overlay_test_text(),
        current_segment,
    }: {
        style?: OverlayStyle;
        scale?: number;
        max_width?: number;
        test_mode?: boolean;
        test_text?: string;
        current_segment?: WhisperSegment;
    } = $props();

    let canvas_el: HTMLCanvasElement | undefined = $state();
    let dimensions = $state({ width: 0, height: 0 });
    let font_revision = $state(0);
    let draw_token = 0;
    const counter_alpha_threshold = 8;
    const caption_text = $derived(
        current_segment?.items.length
            ? current_segment.items.map((item) => item.text).join("")
            : test_mode
              ? test_text
              : "",
    );
    const rgb = $derived(hexToRgb(style.background_color));

    const drawCaption = () => {
        if (!canvas_el) return;
        const context = canvas_el.getContext("2d");
        if (!context) return;
        context.font = captionFont(style, scale);
        const layout = captionTextLayout({
            text: caption_text,
            style,
            width: max_width * scale,
            scale,
            measureText: (text) => context.measureText(text),
        });
        const { width, height } = layout;
        dimensions = { width, height };
        const pixel_ratio = window.devicePixelRatio || 1;
        const backing_width = Math.max(1, Math.ceil(width * pixel_ratio));
        const backing_height = Math.max(1, Math.ceil(height * pixel_ratio));
        canvas_el.width = backing_width;
        canvas_el.height = backing_height;
        context.setTransform(pixel_ratio, 0, 0, pixel_ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.font = layout.font;
        const text_align = layout.align as CanvasTextAlign;
        context.textAlign = text_align;
        context.textBaseline = "top";
        context.lineJoin = "round";
        context.miterLimit = 2;
        context.lineWidth = Math.max(0, style.stroke_width * scale * 2);
        context.strokeStyle = style.stroke_color;
        context.fillStyle = style.text_color;
        for (const line of layout.lines) {
            if (context.lineWidth > 0)
                context.strokeText(line.text, line.x, line.y);
            context.fillText(line.text, line.x, line.y);
        }
        if (context.lineWidth <= 0 || typeof document === "undefined") return;

        const mask_canvas = document.createElement("canvas");
        mask_canvas.width = backing_width;
        mask_canvas.height = backing_height;

        const mask_context = mask_canvas.getContext("2d", {
            willReadFrequently: true,
        });
        if (!mask_context) return;

        mask_context.setTransform(pixel_ratio, 0, 0, pixel_ratio, 0, 0);
        mask_context.font = layout.font;
        mask_context.textAlign = text_align;
        mask_context.textBaseline = "top";
        mask_context.fillStyle = "#000000";

        for (const line of layout.lines) {
            mask_context.fillText(line.text, line.x, line.y);
        }

        const mask = mask_context.getImageData(
            0,
            0,
            backing_width,
            backing_height,
        );
        const enclosed_pixels = enclosedTransparentPixels(
            mask.data,
            backing_width,
            backing_height,
            counter_alpha_threshold,
        );
        const output = context.getImageData(
            0,
            0,
            backing_width,
            backing_height,
        );
        const output_data = output.data;
        const outline_rgb = hexToRgb(style.stroke_color || "#000000");

        for (let index = 0; index < enclosed_pixels.length; index += 1) {
            if (!enclosed_pixels[index]) continue;

            const offset = index * 4;
            output_data[offset] = outline_rgb.r;
            output_data[offset + 1] = outline_rgb.g;
            output_data[offset + 2] = outline_rgb.b;
            output_data[offset + 3] = 255;
        }

        context.putImageData(output, 0, 0);
    };

    onMount(() => {
        void document.fonts.ready.then(() => (font_revision += 1));
    });
    $effect(() => {
        canvas_el;
        caption_text;
        max_width;
        scale;
        font_revision;
        style.align;
        style.font_size;
        style.padding;
        style.stroke_width;
        style.stroke_color;
        style.text_color;
        const token = ++draw_token;
        void tick().then(() => {
            if (token === draw_token) drawCaption();
        });
    });
</script>

{#if caption_text.trim()}
    <div
        data-caption
        class="pointer-events-none relative shrink-0 select-none"
        style:width={dimensions.width + "px"}
        style:height={dimensions.height + "px"}
        style:background-color={`rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${style.background_opacity / 100})`}
        style:border-radius={style.border_radius * scale + "px"}
    >
        <canvas
            class="absolute inset-0 block h-full w-full"
            bind:this={canvas_el}
            aria-hidden="true"
        ></canvas>
        <span class="sr-only">{caption_text}</span>
    </div>
{/if}
