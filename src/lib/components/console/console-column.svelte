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
        "flex min-w-0 flex-col border-r border-border last:border-r-0",
        className,
    )}
>
    <header
        class="flex items-center gap-2 border-b border-border px-4 py-3"
    >
        <Icon class="size-4 text-muted-foreground" />
        <span
            class="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground"
        >
            {label}
        </span>
        {#if count}
            <span
                class="ml-auto text-[10px] font-medium text-muted-foreground/70"
            >
                {count}
            </span>
        {/if}
    </header>
    <div class="flex min-w-0 flex-1 flex-col gap-4 p-4">
        {@render children()}
    </div>
</section>
