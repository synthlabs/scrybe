<script lang="ts">
    import type { Component, Snippet } from "svelte";
    import { Button } from "$lib/components/ui/button/index.ts";
    import * as Collapsible from "$lib/components/ui/collapsible/index.ts";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    let {
        open = $bindable(false),
        title,
        children,
        id,
        onOpenChange,
        locked = false,
        icon: Icon,
    }: {
        open?: boolean;
        title: string;
        children: Snippet;
        id: string;
        onOpenChange?: (value: boolean) => void;
        locked?: boolean;
        icon?: Component<{ class?: string; "aria-hidden"?: "true" }>;
    } = $props();
</script>

<Collapsible.Root
    bind:open
    {onOpenChange}
    class="border-border mx-[calc(var(--panel-inset,0px)*-1)] border-t first:border-t-0"
>
    <Collapsible.Trigger
        {id}
        disabled={locked}
        class="focus-visible:outline-scrybe flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-none px-[var(--panel-inset,0px)] py-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2"
    >
        {#snippet child({ props })}
            <Button
                {...props}
                variant="ghost"
                class={`focus-visible:ring-0 focus-visible:ring-offset-0 [&_svg]:size-5 ${props.class ?? ""}`}
            >
                {title}<ChevronDown
                    data-disclosure-chevron
                    class={`ml-auto shrink-0 transition-transform duration-(--scrybe-duration-standard) ease-out ${open ? "rotate-180" : ""}`}
                />
                {#if Icon}
                    <Icon
                        class="text-muted-foreground order-first"
                        aria-hidden="true"
                    />
                {/if}
            </Button>
        {/snippet}
    </Collapsible.Trigger>
    <Collapsible.Content
        class="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden duration-(--scrybe-duration-standard) ease-out"
    >
        <div
            class="grid grid-cols-1 gap-5 px-[var(--panel-inset,0px)] pt-1 pb-5"
        >
            {@render children()}
        </div>
    </Collapsible.Content>
</Collapsible.Root>
