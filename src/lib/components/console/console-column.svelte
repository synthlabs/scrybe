<script lang="ts">
    import type { Component, Snippet } from "svelte";
    import { cn } from "$lib/utils";

    interface Props {
        icon: Component;
        label: string;
        count?: string;
        class?: string;
        children: Snippet;
    }

    let {
        icon: Icon,
        label,
        count,
        class: className,
        children,
    }: Props = $props();
</script>

<section
    class={cn(
        "bg-card/30 flex min-w-0 flex-col overflow-hidden rounded-md border border-border/60",
        className,
    )}
>
    <header class="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <Icon class="text-scrybe/75 size-4" />
        <span
            class="text-muted-foreground text-xs font-semibold uppercase tracking-[0.05em]"
        >
            {label}
        </span>
        {#if count}
            <span
                class="text-muted-foreground/70 ml-auto text-[10px] font-medium"
            >
                {count}
            </span>
        {/if}
    </header>
    <div class="flex min-w-0 flex-1 flex-col gap-4 p-4">
        {@render children()}
    </div>
</section>
