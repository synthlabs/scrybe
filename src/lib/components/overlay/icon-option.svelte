<script lang="ts">
    import * as Tooltip from "$lib/components/ui/tooltip/index.ts";
    import { Button } from "$lib/components/ui/button/index.ts";
    import type { Snippet } from "svelte";
    let {
        label,
        selected,
        onclick,
        children,
        disabled = false,
    }: {
        label: string;
        selected: boolean;
        onclick: () => void;
        children: Snippet;
        disabled?: boolean;
    } = $props();
</script>

<Tooltip.Provider delayDuration={200}>
    <Tooltip.Root>
        <Tooltip.Trigger>
            {#snippet child({ props })}
                <Button
                    {...props}
                    variant="outline"
                    size="icon"
                    type="button"
                    class={`icon-option p-0 focus-visible:ring-0 focus-visible:ring-offset-0 ${selected ? "selected" : ""}`}
                    aria-label={label}
                    aria-pressed={selected}
                    {onclick}
                    {disabled}
                >
                    {@render children()}
                </Button>
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip.Root>
</Tooltip.Provider>

<style>
    :global(.icon-option) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        width: 2.25rem;
        height: 2.25rem;
        flex-shrink: 0;
        border: 1px solid var(--scrybe-color-border-control);
        border-radius: var(--scrybe-radius-control);
        color: var(--muted-foreground);
        background: transparent;
        cursor: pointer;
    }
    :global(.icon-option:hover) {
        background: var(--accent);
    }
    :global(.icon-option.selected) {
        background: var(--scrybe-fill-selected);
        border-color: var(--scrybe-color-brand);
        color: var(--scrybe-color-brand);
    }
    :global(.icon-option:focus-visible) {
        outline: 2px solid var(--scrybe-color-focus);
        outline-offset: 2px;
    }
    :global(.icon-option:disabled) {
        cursor: default;
        opacity: 0.5;
    }
</style>
