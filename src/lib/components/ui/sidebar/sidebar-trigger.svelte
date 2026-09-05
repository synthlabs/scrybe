<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.ts";
    import { cn } from "$lib/utils.ts";
    import PanelLeft from "@lucide/svelte/icons/panel-left";
    import type { ComponentProps } from "svelte";
    import { useSidebar } from "./context.svelte.ts";
    import * as Tooltip from "$lib/components/ui/tooltip/index.ts";
    import { m as msgs } from "$lib/paraglide/messages";

    let {
        ref = $bindable(null),
        class: className,
        onclick,
        ...restProps
    }: ComponentProps<typeof Button> & {
        onclick?: (e: MouseEvent) => void;
    } = $props();

    const sidebar = useSidebar();
</script>

<Tooltip.Root>
    <Tooltip.Trigger>
        {#snippet child({ props })}
            <Button
                {...props}
                type="button"
                onclick={(e) => {
                    onclick?.(e);
                    sidebar.toggle();
                }}
                data-sidebar="trigger"
                variant="ghost"
                size="icon"
                class={cn("size-8", className)}
                aria-label={msgs.sidebar_toggle()}
                aria-expanded={sidebar.isMobile
                    ? sidebar.openMobile
                    : sidebar.open}
                {...restProps}
            >
                <PanelLeft />
            </Button>
        {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side="bottom">{msgs.sidebar_toggle()}</Tooltip.Content>
</Tooltip.Root>
