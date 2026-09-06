<script lang="ts">
    import { Tooltip as TooltipPrimitive } from "bits-ui";
    import { cn } from "$lib/utils.ts";

    const uid = $props.id();
    let {
        id = uid,
        ref = $bindable(null),
        class: className,
        sideOffset = 4,
        children,
        child,
        ...restProps
    }: TooltipPrimitive.ContentProps = $props();
</script>

<TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
        role="tooltip"
        {id}
        bind:ref
        {sideOffset}
        class={cn(
            "bg-popover text-popover-foreground animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 z-[60] max-w-[min(20rem,calc(100vw-2rem))] rounded-lg border px-3 py-2 text-sm leading-5 break-words shadow-md duration-(--scrybe-duration-fast)",
            className,
        )}
        {...restProps}
    >
        {#snippet child({ props, wrapperProps, open })}
            {#if child}
                {@render child({
                    props: { ...props, id, role: "tooltip" },
                    wrapperProps,
                    open,
                })}
            {:else}
                <div {...wrapperProps} style:z-index={60}>
                    <div {...props} {id} role="tooltip">
                        {@render children?.()}
                    </div>
                </div>
            {/if}
        {/snippet}
    </TooltipPrimitive.Content>
</TooltipPrimitive.Portal>
