<script lang="ts">
    import { Select as SelectPrimitive, type WithoutChild } from "bits-ui";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import { cn } from "$lib/utils.ts";
    import { Button } from "$lib/components/ui/button/index.ts";

    let {
        ref = $bindable(null),
        class: className,
        children,
        ...restProps
    }: WithoutChild<SelectPrimitive.TriggerProps> = $props();
</script>

<SelectPrimitive.Trigger
    bind:ref
    class={cn(
        "border-input bg-background ring-offset-background data-[placeholder]:text-muted-foreground focus:ring-ring flex min-h-9 w-full cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-left text-sm focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
        className,
    )}
    {...restProps}
>
    {#snippet child({ props })}
        <Button
            {...props}
            variant="outline"
            class={`hover:bg-background hover:text-foreground font-normal ${props.class ?? ""}`}
        >
            {@render children?.()}
            <ChevronDown class="text-muted-foreground size-4 shrink-0" />
        </Button>
    {/snippet}
</SelectPrimitive.Trigger>
