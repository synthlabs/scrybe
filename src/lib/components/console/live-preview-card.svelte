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
        "rounded-md border bg-scrybe-soft/30",
        className,
    )}
    style="border-color: hsl(17 75% 65% / 0.18);"
>
    <header class="flex items-center gap-3 border-b border-border/50 px-4 py-2.5">
        <span class="relative flex h-2 w-2 items-center justify-center">
            <span
                class="absolute inline-flex h-2 w-2 rounded-full bg-scrybe opacity-80 animate-scrybe-pulse"
            ></span>
            <span class="relative inline-flex h-2 w-2 rounded-full bg-scrybe"></span>
        </span>
        <span
            class="text-[10px] font-bold uppercase tracking-[0.08em] text-scrybe-ring"
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
