<script lang="ts">
    import type { Snippet } from "svelte";
    import { cn } from "$lib/utils";
    import { m as msgs } from "$lib/paraglide/messages";

    interface Props {
        subtitle?: string;
        pills?: Snippet;
        class?: string;
        children: Snippet;
    }

    let { subtitle, pills, class: className, children }: Props = $props();
</script>

<div
    class={cn(
        "bg-card/30 rounded-md border border-border/60",
        className,
    )}
>
    <header class="flex items-center gap-3 border-b border-border/50 px-4 py-2.5">
        <span class="relative flex h-2 w-2 items-center justify-center">
            <span class="bg-scrybe/80 relative inline-flex h-1.5 w-1.5 rounded-full"></span>
        </span>
        <span
            class="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.08em]"
        >
            {msgs.settings_live_preview_label()}
        </span>
        {#if subtitle}
            <span class="text-xs text-muted-foreground">{subtitle}</span>
        {/if}
        {#if pills}
            <div class="ml-auto flex items-center gap-1">
                {@render pills()}
            </div>
        {/if}
    </header>
    <div class="px-4 py-3">
        {@render children()}
    </div>
</div>
