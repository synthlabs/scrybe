<script lang="ts">
    import { onMount, tick } from "svelte";
    import type { OverlayStyle, WhisperSegment } from "$lib/bindings";
    import {
        captionFont,
        captionTextLayout,
        enclosedTransparentPixels,
    } from "$lib/overlay/canvas-text.js";
    import { hexToRgb } from "$lib/overlay/layout-math.js";
    import { m as msgs } from "$lib/paraglide/messages";

    interface Props {
        style?: OverlayStyle;
        scale?: number;
        test_mode?: boolean;
        test_text?: string;
        current_segment?: WhisperSegment;
    }

    const DEFAULT_STYLE: OverlayStyle = {
        align: "center",
        font_size: 32,
        text_color: "#ffffff",
        stroke_color: "#000000",
        stroke_width: 0,
        background_color: "#000000",
        background_opacity: 55,
        border_radius: 12,
        padding: "normal",
    };

    let {
        style = DEFAULT_STYLE,
        scale = 1,
        test_mode = false,
        test_text = msgs.overlay_test_text(),
        current_segment = {
            id: "",
            index: 0,
            items: [],
        },
    }: Props = $props();

    let wrapper_el: HTMLDivElement | undefined = $state();
    let canvas_el: HTMLCanvasElement | undefined = $state();
    let draw_token = 0;

    let rgb = $derived(hexToRgb(style.background_color));
    let opacity = $derived(style.background_opacity / 100);
    let has_segment = $derived(current_segment.items.length > 0);
    let caption_text = $derived(
        has_segment
            ? current_segment.items.map((item) => item.text).join("")
            : test_text,
    );
    let caption_style = $derived(
        [
            `background-color: rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${opacity})`,
            `border-radius: ${style.border_radius * scale}px`,
        ].join("; "),
    );
    const counter_alpha_threshold = 8;

    const measureCaptionSize = () => {
        return {
            width: Math.max(0, wrapper_el?.clientWidth ?? 0),
            height: Math.max(0, wrapper_el?.clientHeight ?? 0),
        };
    };

    const drawCaption = (width: number, height: number) => {
        if (!canvas_el || width <= 0 || height <= 0) return;

        const context = canvas_el.getContext("2d");
        if (!context) return;

        const pixel_ratio =
            typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
        const backing_width = Math.max(1, Math.round(width * pixel_ratio));
        const backing_height = Math.max(1, Math.round(height * pixel_ratio));

        if (canvas_el.width !== backing_width) {
            canvas_el.width = backing_width;
        }
        if (canvas_el.height !== backing_height) {
            canvas_el.height = backing_height;
        }

        context.setTransform(pixel_ratio, 0, 0, pixel_ratio, 0, 0);
        context.clearRect(0, 0, width, height);

        context.font = captionFont(style, scale);
        const layout = captionTextLayout({
            text: caption_text,
            style,
            width,
            height,
            scale,
            measureText: (text: string) => context.measureText(text),
        });

        const text_align: CanvasTextAlign =
            layout.align === "left" || layout.align === "right"
                ? layout.align
                : "center";

        context.font = layout.font;
        context.textAlign = text_align;
        context.textBaseline = "top";
        context.lineJoin = "round";
        context.miterLimit = 2;
        context.lineWidth = Math.max(0, (style.stroke_width ?? 0) * scale * 2);
        context.strokeStyle = style.stroke_color || "#000000";
        context.fillStyle = style.text_color || "#ffffff";

        for (const line of layout.lines) {
            if (context.lineWidth > 0) {
                context.strokeText(line.text, line.x, line.y);
            }
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

    const scheduleFrame = (callback: FrameRequestCallback) => {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(callback);
            return;
        }

        setTimeout(() => callback(performance.now()), 0);
    };

    const queueDraw = () => {
        const token = ++draw_token;

        void tick().then(() => {
            if (token !== draw_token) return;

            scheduleFrame(() => {
                if (token !== draw_token) return;

                const size = measureCaptionSize();
                drawCaption(size.width, size.height);
            });
        });
    };

    onMount(() => {
        queueDraw();
        if (!wrapper_el) return;

        const observer = new ResizeObserver(queueDraw);
        observer.observe(wrapper_el);

        return () => observer.disconnect();
    });

    $effect(() => {
        wrapper_el;
        canvas_el;
        caption_text;
        style.align;
        style.font_size;
        style.padding;
        style.stroke_color;
        style.stroke_width;
        style.text_color;
        scale;
        queueDraw();
    });
</script>

{#if has_segment || test_mode}
    <div
        class="pointer-events-none relative box-border h-full w-full overflow-hidden select-none"
        style={caption_style}
        bind:this={wrapper_el}
    >
        <canvas
            class="absolute inset-0 block h-full w-full"
            bind:this={canvas_el}
            aria-hidden="true"
        >
        </canvas>
        <span class="sr-only">{caption_text}</span>
    </div>
{/if}
