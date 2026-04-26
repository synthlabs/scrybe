<script lang="ts">
    import TextOverlay from "$lib/components/overlay/text-overlay.svelte";
    import type { OverlayConfig } from "$lib/bindings";

    interface Props {
        config: OverlayConfig;
        height?: string;
    }

    let { config, height = "140px" }: Props = $props();
</script>

<div
    class="overflow-hidden rounded-md border border-border bg-checkered"
    style="height: {height};"
>
    <TextOverlay
        test_mode={true}
        justify={config.text_alignment}
        background={config.background_color}
        transparency={config.transparency}
        font_size={config.font_size}
        font_weight={config.font_weight}
        corner_radius={config.corner_radius}
        padding_x={config.padding_x}
        padding_y={config.padding_y}
        drop_shadow={config.drop_shadow}
    />
</div>

<style>
    .bg-checkered {
        background-color: #2a2a2c;
        background-image:
            linear-gradient(45deg, #1f1f21 25%, transparent 25%),
            linear-gradient(-45deg, #1f1f21 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #1f1f21 75%),
            linear-gradient(-45deg, transparent 75%, #1f1f21 75%);
        background-size: 16px 16px;
        background-position:
            0 0,
            0 8px,
            8px -8px,
            -8px 0;
    }
</style>
