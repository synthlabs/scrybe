<script lang="ts">
    import AlignLeft from "@lucide/svelte/icons/align-left";
    import AlignCenter from "@lucide/svelte/icons/align-center";
    import AlignRight from "@lucide/svelte/icons/align-right";
    import IconOption from "./icon-option.svelte";
    import { m as msgs } from "$lib/paraglide/messages";
    let {
        value,
        onChange,
        ariaLabel,
        disabled = false,
    }: {
        value: string;
        onChange: (value: string) => void;
        ariaLabel?: string;
        disabled?: boolean;
    } = $props();
    const options = [
        { value: "left", label: msgs.overlay_align_left, icon: AlignLeft },
        {
            value: "center",
            label: msgs.overlay_align_center,
            icon: AlignCenter,
        },
        { value: "right", label: msgs.overlay_align_right, icon: AlignRight },
    ];
</script>

<div
    class="flex flex-wrap gap-2"
    role="group"
    aria-label={ariaLabel ?? msgs.overlay_align_label()}
>
    {#each options as option}
        <IconOption
            label={option.label()}
            selected={value === option.value}
            onclick={() => onChange(option.value)}
            {disabled}
        >
            <option.icon class="size-[1.125rem]" />
        </IconOption>
    {/each}
</div>
