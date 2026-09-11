<script lang="ts">
    import type { Snippet } from "svelte";
    import type { HTMLAttributes } from "svelte/elements";
    import { cn } from "$lib/utils.ts";

    let {
        as = "section",
        class: className,
        children,
        ...restProps
    }: HTMLAttributes<HTMLElement> & {
        as?: "section" | "div";
        children: Snippet;
    } = $props();
</script>

<!-- --panel-inset mirrors the horizontal padding so rows can bleed to the edge. -->
<svelte:element
    this={as}
    class={cn(
        "bg-card border-border rounded-lg border p-4 [--panel-inset:1rem] sm:p-5 sm:[--panel-inset:1.25rem]",
        className,
    )}
    {...restProps}
>
    {@render children()}
</svelte:element>
