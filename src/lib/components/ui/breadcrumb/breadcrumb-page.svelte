<script lang="ts">
    import type { WithElementRef } from "bits-ui";
    import type { HTMLAttributes } from "svelte/elements";
    import { cn } from "$lib/utils.ts";

    let {
        ref = $bindable(null),
        class: className,
        children,
        ...restProps
    }: WithElementRef<HTMLAttributes<HTMLSpanElement>> = $props();
</script>

<span
    bind:this={ref}
    role="link"
    aria-disabled="true"
    aria-current="page"
    class={cn("text-foreground font-normal capitalize", className)}
    {...restProps}
>
    {@render children?.()}
</span>
