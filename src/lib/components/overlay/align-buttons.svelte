<script lang="ts">
    import * as ToggleGroup from "$lib/components/ui/toggle-group/index.ts";
    import AlignLeft from "@lucide/svelte/icons/align-left";
    import AlignCenter from "@lucide/svelte/icons/align-center";
    import AlignRight from "@lucide/svelte/icons/align-right";

    interface Props {
        value: string;
        onChange: (next: string) => void;
        ariaLabel?: string;
    }

    let { value, onChange, ariaLabel }: Props = $props();
</script>

<ToggleGroup.Root
    type="single"
    {value}
    aria-label={ariaLabel}
    onValueChange={(v) => {
        if (v) onChange(v);
    }}
>
    <ToggleGroup.Item value="left" aria-label="Left">
        <AlignLeft class="size-3.5" />
    </ToggleGroup.Item>
    <ToggleGroup.Item value="center" aria-label="Center">
        <AlignCenter class="size-3.5" />
    </ToggleGroup.Item>
    <ToggleGroup.Item value="right" aria-label="Right">
        <AlignRight class="size-3.5" />
    </ToggleGroup.Item>
</ToggleGroup.Root>
