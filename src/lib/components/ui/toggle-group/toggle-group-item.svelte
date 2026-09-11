<script lang="ts">
    import {
        ToggleGroup as ToggleGroupPrimitive,
        type WithoutChildrenOrChild,
    } from "bits-ui";
    import { cn } from "$lib/utils.ts";
    import type { Snippet } from "svelte";

    type Props = WithoutChildrenOrChild<ToggleGroupPrimitive.ItemProps> & {
        children?: Snippet;
    };

    let {
        ref = $bindable(null),
        class: className,
        children,
        ...restProps
    }: Props = $props();
</script>

<ToggleGroupPrimitive.Item
    bind:ref
    class={cn(
        "text-muted-foreground hover:bg-accent hover:text-foreground data-[state=on]:bg-scrybe-soft data-[state=on]:text-foreground focus-visible:ring-scrybe-ring focus-visible:ring-offset-background inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center gap-1 rounded-md border border-transparent px-2 text-xs font-medium transition-colors duration-(--scrybe-duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        className,
    )}
    {...restProps}
>
    {@render children?.()}
</ToggleGroupPrimitive.Item>
