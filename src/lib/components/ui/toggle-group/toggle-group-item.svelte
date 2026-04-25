<script lang="ts">
    import { ToggleGroup as ToggleGroupPrimitive, type WithoutChildrenOrChild } from "bits-ui";
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
        "inline-flex h-full min-w-7 items-center justify-center gap-1 rounded px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=on]:bg-scrybe-soft data-[state=on]:text-scrybe-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-scrybe-ring disabled:pointer-events-none disabled:opacity-50",
        className,
    )}
    {...restProps}
>
    {@render children?.()}
</ToggleGroupPrimitive.Item>
