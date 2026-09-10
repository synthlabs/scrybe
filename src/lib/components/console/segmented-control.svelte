<script lang="ts">
    import * as ToggleGroup from "$lib/components/ui/toggle-group/index.ts";
    import { cn } from "$lib/utils";

    interface Option {
        value: string;
        label: string;
    }

    interface Props {
        options: Option[];
        value: string;
        onChange: (value: string) => void;
        size?: "default" | "sm";
        class?: string;
        ariaLabel?: string;
        disabled?: boolean;
    }

    let {
        options,
        value = $bindable(),
        onChange,
        size = "default",
        class: className,
        ariaLabel,
        disabled = false,
    }: Props = $props();
</script>

<ToggleGroup.Root
    type="single"
    {value}
    {size}
    {disabled}
    aria-label={ariaLabel}
    onValueChange={(v) => {
        if (v) {
            value = v;
            onChange(v);
        }
    }}
    class={cn(className)}
>
    {#each options as opt (opt.value)}
        <ToggleGroup.Item value={opt.value} aria-label={opt.label}>
            {opt.label}
        </ToggleGroup.Item>
    {/each}
</ToggleGroup.Root>
