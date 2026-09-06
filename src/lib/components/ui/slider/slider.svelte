<script lang="ts">
    import {
        Slider as SliderPrimitive,
        type WithoutChildrenOrChild,
    } from "bits-ui";
    import { cn } from "$lib/utils.js";

    let {
        ref = $bindable(null),
        value = $bindable(),
        class: className,
        ...restProps
    }: WithoutChildrenOrChild<SliderPrimitive.RootProps> = $props();
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<SliderPrimitive.Root
    bind:value={value as never}
    bind:ref
    class={cn(
        "relative flex h-9 w-full cursor-pointer touch-none items-center select-none",
        className,
    )}
    {...restProps}
>
    {#snippet children({ thumbs })}
        <span
            class="relative h-1 w-full grow overflow-hidden rounded-sm bg-[var(--scrybe-color-border-control)]"
        >
            <SliderPrimitive.Range class="absolute h-full bg-transparent" />
        </span>
        {#each thumbs as thumb}
            <SliderPrimitive.Thumb
                index={thumb}
                aria-label={restProps["aria-label"]}
                aria-labelledby={restProps["aria-labelledby"]}
                class="border-background bg-scrybe ring-offset-background focus-visible:outline-scrybe block size-5 cursor-pointer rounded-full border-2 shadow-[0_0_0_1px_var(--scrybe-color-brand)] transition-colors duration-(--scrybe-duration-fast) focus-visible:outline-2 focus-visible:outline-offset-4 disabled:pointer-events-none disabled:opacity-50"
            />
        {/each}
    {/snippet}
</SliderPrimitive.Root>
