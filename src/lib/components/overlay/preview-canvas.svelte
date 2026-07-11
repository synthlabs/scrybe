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
    class="border-border/60 overflow-hidden rounded-md border bg-[#1b1d20] [background-image:linear-gradient(45deg,#17191c_25%,transparent_25%),linear-gradient(-45deg,#17191c_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#17191c_75%),linear-gradient(-45deg,transparent_75%,#17191c_75%)] [background-size:16px_16px] [background-position:0_0,0_8px,8px_-8px,-8px_0] p-2"
    style="height: {height};"
>
    <TextOverlay test_mode={true} style={config.style} scale={0.62} />
</div>
