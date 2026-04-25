<script lang="ts" module>
    import { type VariantProps, tv } from "tailwind-variants";

    export const toggleGroupVariants = tv({
        base: "inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 p-0.5",
        variants: {
            size: {
                default: "h-9",
                sm: "h-7",
            },
        },
        defaultVariants: {
            size: "default",
        },
    });

    export type ToggleGroupSize = VariantProps<typeof toggleGroupVariants>["size"];
</script>

<script lang="ts">
    import { ToggleGroup as ToggleGroupPrimitive, type WithoutChildrenOrChild } from "bits-ui";
    import { cn } from "$lib/utils.ts";
    import type { Snippet } from "svelte";

    type Props = WithoutChildrenOrChild<ToggleGroupPrimitive.RootProps> & {
        size?: ToggleGroupSize;
        children?: Snippet;
    };

    let {
        ref = $bindable(null),
        class: className,
        size = "default",
        children,
        ...restProps
    }: Props = $props();
</script>

<ToggleGroupPrimitive.Root
    bind:ref
    class={cn(toggleGroupVariants({ size }), className)}
    {...restProps}
>
    {@render children?.()}
</ToggleGroupPrimitive.Root>
