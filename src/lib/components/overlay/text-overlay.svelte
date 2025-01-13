<script lang="ts">
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
        justify?: "left" | "center" | "right" | undefined;
        text?: string;
        background?: string;
        transparency?: number;
    }

    let {
        justify,
        text = "I'm an example of a subtitle, and how I will look on the overlay browser source.",
        background = "",
        transparency = 100,
    }: Props = $props();

    let rgb = $derived(hexToRgb(background));
    let derived_opacity = $derived(transparency / 100.0);
    let outer_style = $derived(`text-align: ${justify};`);
    let inner_style = $derived(
        `--tw-bg-opacity: ${derived_opacity}; background-color: rgb(${rgb.r} ${rgb.g} ${rgb.b} / var(--tw-bg-opacity, 1));`,
    );
</script>

<div
    class="mx-auto flex h-full w-full flex-col justify-center p-1"
    style={outer_style}
>
    <div
        class="flex h-full w-full flex-col justify-center rounded-xl p-4"
        style={inner_style}
    >
        {text}
    </div>
</div>
