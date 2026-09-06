<script lang="ts" module>
    import { tv, type VariantProps } from "tailwind-variants";
    export const sheetVariants = tv({
        base: "bg-popover data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 gap-4 p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-(--scrybe-duration-standard) data-[state=open]:duration-(--scrybe-duration-standard)",
        variants: {
            side: {
                top: "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 border-b",
                bottom: "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 border-t",
                left: "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
                right: "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
            },
        },
        defaultVariants: {
            side: "right",
        },
    });

    export type Side = VariantProps<typeof sheetVariants>["side"];
</script>

<script lang="ts">
    import {
        Dialog as SheetPrimitive,
        type WithoutChildrenOrChild,
    } from "bits-ui";
    import X from "@lucide/svelte/icons/x";
    import { Button } from "$lib/components/ui/button/index.ts";
    import type { Snippet } from "svelte";
    import SheetOverlay from "./sheet-overlay.svelte";
    import { cn } from "$lib/utils.ts";
    import * as Tooltip from "$lib/components/ui/tooltip/index.ts";
    import { m as msgs } from "$lib/paraglide/messages";

    let {
        ref = $bindable(null),
        class: className,
        side = "right",
        closeLabel = msgs.common_close(),
        portalProps,
        children,
        ...restProps
    }: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
        portalProps?: SheetPrimitive.PortalProps;
        side?: Side;
        closeLabel?: string;
        children: Snippet;
    } = $props();
</script>

<SheetPrimitive.Portal {...portalProps}>
    <SheetOverlay />
    <SheetPrimitive.Content
        bind:ref
        class={cn(sheetVariants({ side }), className)}
        {...restProps}
    >
        {@render children?.()}
        <Tooltip.Provider delayDuration={200}>
            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <SheetPrimitive.Close
                            {...props}
                            class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-popover absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-md transition-colors duration-(--scrybe-duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none"
                            aria-label={closeLabel}
                        >
                            {#snippet child({ props: closeProps })}
                                <Button
                                    {...closeProps}
                                    variant="ghost"
                                    size="icon"
                                >
                                    <X class="size-4" />
                                </Button>
                            {/snippet}
                        </SheetPrimitive.Close>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content>{closeLabel}</Tooltip.Content>
            </Tooltip.Root>
        </Tooltip.Provider>
    </SheetPrimitive.Content>
</SheetPrimitive.Portal>
