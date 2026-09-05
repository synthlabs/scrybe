<script lang="ts">
    import Info from "@lucide/svelte/icons/info";
    import * as Tooltip from "$lib/components/ui/tooltip/index.ts";
    import { m as msgs } from "$lib/paraglide/messages";

    let { label, description }: { label: string; description: string } =
        $props();
</script>

<Tooltip.Provider delayDuration={200}>
    <Tooltip.Root>
        <Tooltip.Trigger
            type="button"
            aria-label={msgs.home_metric_help({ label })}
            class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-(--scrybe-duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
            <Info class="size-4" />
        </Tooltip.Trigger>
        <Tooltip.Content side="left">{description}</Tooltip.Content>
    </Tooltip.Root>
</Tooltip.Provider>
