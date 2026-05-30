<script lang="ts">
    import type { OverlayStyle, WhisperSegment } from "$lib/bindings";
    import {
        hexToRgb,
        paddingPixels,
    } from "$lib/overlay/layout-math.js";
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
        font_size: 44,
        text_color: "#ffffff",
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

    const justify = (align: string) => {
        if (align === "left") return "flex-start";
        if (align === "right") return "flex-end";
        return "center";
    };

    let rgb = $derived(hexToRgb(style.background_color));
    let opacity = $derived(style.background_opacity / 100);
    let padding = $derived(paddingPixels(style.padding) * scale);
    let has_segment = $derived(current_segment.items.length > 0);
    let caption_text = $derived(
        has_segment
            ? current_segment.items.map((item) => item.text).join("")
            : test_text,
    );
    let caption_style = $derived(
        [
            "width: 100%",
            "height: 100%",
            "display: flex",
            "align-items: center",
            `justify-content: ${justify(style.align)}`,
            "box-sizing: border-box",
            `padding: ${padding}px`,
            `background-color: rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${opacity})`,
            `border-radius: ${style.border_radius * scale}px`,
            `font: 500 ${style.font_size * scale}px/1.25 ui-sans-serif, system-ui, sans-serif`,
            `color: ${style.text_color}`,
            `text-align: ${style.align}`,
            `text-shadow: 0 ${2 * scale}px ${4 * scale}px rgba(0, 0, 0, 0.5)`,
            "pointer-events: none",
            "user-select: none",
            "overflow: hidden",
        ].join("; "),
    );
</script>

{#if has_segment || test_mode}
    <div style={caption_style}>
        <div class="max-w-full min-w-0 text-wrap">
            {caption_text}
        </div>
    </div>
{/if}
