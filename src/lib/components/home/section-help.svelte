<script lang="ts">
    import Info from "@lucide/svelte/icons/info";
    import * as Tooltip from "$lib/components/ui/tooltip/index.ts";
    import { m as msgs } from "$lib/paraglide/messages";

    let {
        id,
        label,
        entries,
    }: {
        id: string;
        label: string;
        entries: { label: string; description: string }[];
    } = $props();
    let content = $state<HTMLDivElement | null>(null);

    function scroll_help(event: KeyboardEvent) {
        if (!content || event.altKey || event.ctrlKey || event.metaKey) return;
        if (content.scrollHeight <= content.clientHeight) return;
        const line = parseFloat(getComputedStyle(content).lineHeight);
        const targets: Record<string, number> = {
            ArrowDown: content.scrollTop + line,
            ArrowUp: content.scrollTop - line,
            PageDown: content.scrollTop + content.clientHeight,
            PageUp: content.scrollTop - content.clientHeight,
            Home: 0,
            End: content.scrollHeight,
        };
        const top = targets[event.key];
        if (top === undefined) return;
        event.preventDefault();
        content.scrollTo({ top, behavior: "instant" });
    }
</script>

<Tooltip.Provider delayDuration={200}>
    <Tooltip.Root>
        <Tooltip.Trigger
            {id}
            type="button"
            aria-label={msgs.home_metric_help({ label })}
            onkeydown={scroll_help}
            class="text-muted-foreground hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-(--scrybe-duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
            <Info class="size-4" />
        </Tooltip.Trigger>
        <Tooltip.Content
            bind:ref={content}
            side="left"
            collisionPadding={16}
            class="max-h-[min(var(--bits-floating-available-height),calc(100dvh-2rem))] max-w-[min(20rem,var(--bits-floating-available-width),calc(100vw-2rem))] overflow-y-auto overscroll-contain p-3 text-xs leading-4"
        >
            <dl class="space-y-2">
                {#each entries as entry (entry.label)}
                    <div>
                        <dt class="font-semibold">{entry.label}</dt>
                        <dd class="text-muted-foreground mt-1">
                            {entry.description}
                        </dd>
                    </div>
                {/each}
            </dl>
        </Tooltip.Content>
    </Tooltip.Root>
</Tooltip.Provider>
