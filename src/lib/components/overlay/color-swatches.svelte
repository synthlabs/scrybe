<script lang="ts">
    import Check from "@lucide/svelte/icons/check";
    import * as Tooltip from "$lib/components/ui/tooltip/index.ts";
    import IconOption from "./icon-option.svelte";
    import { m as msgs } from "$lib/paraglide/messages";
    let {
        value,
        presets,
        onChange,
        customLabel = msgs.overlay_custom_color_label(),
        label = customLabel,
        allowCustom = true,
        disabled = false,
    }: {
        value: string;
        presets: string[];
        onChange: (value: string) => void;
        customLabel?: string;
        label?: string;
        allowCustom?: boolean;
        disabled?: boolean;
    } = $props();
    const names: Record<string, () => string> = {
        "#000000": msgs.overlay_color_black,
        "#101216": msgs.overlay_color_dark,
        "#ffffff": msgs.overlay_color_white,
        "#e98963": msgs.overlay_color_orange,
    };
    const custom = $derived(
        !presets.some((color) => color.toLowerCase() === value.toLowerCase()),
    );
    const picker_value = $derived(
        /^#[\da-f]{6}$/i.test(value) ? value : "#ffffff",
    );
</script>

<div class="flex flex-wrap gap-2" role="group" aria-label={label}>
    {#each presets as color}
        <IconOption
            label={names[color]?.() ?? color}
            selected={color.toLowerCase() === value.toLowerCase()}
            onclick={() => onChange(color)}
            {disabled}
        >
            <span class="swatch" style:background={color}></span>
            {#if color.toLowerCase() === value.toLowerCase()}<Check
                    class="swatch-check"
                    size={14}
                />{/if}
        </IconOption>
    {/each}
    {#if allowCustom}
        <label class="custom-color" class:active={custom} title={customLabel}>
            <span
                class="swatch"
                style:background={custom
                    ? value
                    : "conic-gradient(#ed7777,#e9b163,#47d175,#af6dc7,#ed7777)"}
            ></span>
            <Tooltip.Provider delayDuration={200}
                ><Tooltip.Root
                    ><Tooltip.Trigger>
                        {#snippet child({ props })}<input
                                {...props}
                                type="color"
                                value={picker_value}
                                aria-label={customLabel}
                                {disabled}
                                oninput={(event) =>
                                    onChange(event.currentTarget.value)}
                            />{/snippet}
                    </Tooltip.Trigger><Tooltip.Content
                        >{customLabel}</Tooltip.Content
                    ></Tooltip.Root
                ></Tooltip.Provider
            >
        </label>
    {/if}
</div>

<style>
    .swatch {
        width: 1.25rem;
        height: 1.25rem;
        border: 1px solid var(--scrybe-color-border-control);
        border-radius: 0.25rem;
    }
    :global(.swatch-check) {
        position: absolute;
        right: -0.125rem;
        bottom: -0.125rem;
        background: var(--scrybe-color-canvas);
        border-radius: 50%;
    }
    .custom-color {
        position: relative;
        display: grid;
        place-items: center;
        width: 2.25rem;
        height: 2.25rem;
        border: 1px solid var(--scrybe-color-border-control);
        border-radius: 0.375rem;
        cursor: pointer;
    }
    .custom-color.active {
        border-color: var(--scrybe-color-brand);
        background: var(--scrybe-fill-selected);
    }
    .custom-color:focus-within {
        outline: 2px solid var(--scrybe-color-focus);
        outline-offset: 2px;
    }
    input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
    }
</style>
