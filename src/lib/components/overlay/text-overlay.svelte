<script lang="ts">
    import type { WhisperSegment } from "$lib/bindings";
    import { m as msgs } from "$lib/paraglide/messages";

    function hexToRgb(hex: string) {
        // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
        var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, function (m, r, g, b) {
            return r + r + g + g + b + b;
        });

        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16),
              }
            : {
                  r: 0,
                  g: 0,
                  b: 0,
              };
    }

    interface Props {
        justify?: "left" | "center" | "right" | undefined | string;
        test_mode?: boolean;
        test_text?: string;
        background?: string;
        transparency?: number;
        font_size?: number;
        font_weight?: number;
        corner_radius?: number;
        padding_x?: number;
        padding_y?: number;
        drop_shadow?: boolean;
        current_segment?: WhisperSegment;
    }

    let {
        justify,
        test_mode = false,
        test_text = msgs.overlay_test_text(),
        background = "",
        transparency = 100,
        font_size = 28,
        font_weight = 600,
        corner_radius = 4,
        padding_x = 12,
        padding_y = 6,
        drop_shadow = true,
        current_segment = {
            id: "",
            index: 0,
            items: [],
        },
    }: Props = $props();

    let rgb = $derived(hexToRgb(background));
    let derived_opacity = $derived(transparency / 100.0);
    let outer_style = $derived(`text-align: ${justify};`);
    let inner_style = $derived(
        [
            `background-color: rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${derived_opacity})`,
            `border-radius: ${corner_radius}px`,
            `padding: ${padding_y}px ${padding_x}px`,
            `font-size: ${font_size}px`,
            `font-weight: ${font_weight}`,
            drop_shadow
                ? "text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6)"
                : "text-shadow: none",
        ].join("; "),
    );
    let has_segment = $derived(current_segment.items.length > 0);
</script>

{#if has_segment || test_mode}
    <div
        class="mx-auto flex h-full w-full flex-col justify-center bg-transparent p-2"
        style={outer_style}
    >
        <div
            class="flex h-full w-full flex-col justify-center"
            style={inner_style}
        >
            {#if has_segment}
                {#each current_segment.items as segment (segment.index)}
                    <div class="w-full text-wrap">
                        {segment.text}
                    </div>
                {/each}
            {:else if test_mode}
                {test_text}
            {/if}
        </div>
    </div>
{/if}
