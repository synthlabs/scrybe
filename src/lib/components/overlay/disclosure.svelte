<script lang="ts">
    import type { Snippet } from "svelte";
    import { Button } from "$lib/components/ui/button/index.ts";
    import * as Collapsible from "$lib/components/ui/collapsible/index.ts";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    let {
        open = $bindable(false),
        title,
        children,
        id,
    }: {
        open?: boolean;
        title: string;
        children: Snippet;
        id: string;
    } = $props();
</script>

<Collapsible.Root bind:open class="border-border border-t">
    <Collapsible.Trigger
        {id}
        class="focus-visible:outline-scrybe flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-md py-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
    >
        {#snippet child({ props })}
            <Button
                {...props}
                variant="ghost"
                class={`px-0 hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 ${props.class ?? ""}`}
            >
                {title}<ChevronDown
                    class={`size-4 shrink-0 transition-transform duration-(--scrybe-duration-standard) ease-out ${open ? "rotate-180" : ""}`}
                />
            </Button>
        {/snippet}
    </Collapsible.Trigger>
    <Collapsible.Content
        class="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden duration-(--scrybe-duration-standard) ease-out"
    >
        <div class="grid gap-5 pt-1 pb-5">{@render children()}</div>
    </Collapsible.Content>
</Collapsible.Root>
