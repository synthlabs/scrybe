<script lang="ts">
    import { Label } from "$lib/components/ui/label/index.ts";
    import * as Select from "$lib/components/ui/select/index.ts";

    const recording_formats = [
        { value: "1234", label: "Nokia Microphone" },
        { value: "5678", label: "NDI Audio" },
        { value: "9012", label: "MacBook Pro Microphone" },
        { value: "3456", label: "MacBook Pro Speakers" },
        { value: "7890", label: "NDI Audio" },
    ];

    let value = $state("");

    const triggerContent = $derived(
        recording_formats.find((f) => f.value === value)?.label ?? "Default",
    );
</script>

<div class="max-w-72 space-y-2 pb-4">
    <Label
        id="audio_device-label"
        for="audio_device"
        class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
    >
        Recording Format
    </Label>
    <Select.Root type="single" bind:value>
        <Select.Trigger class="">{triggerContent}</Select.Trigger>
        <Select.Content>
            {#each recording_formats as format}
                <Select.Item value={format.value} label={format.label}
                    >{format.label}</Select.Item
                >
            {/each}
        </Select.Content>
    </Select.Root>
</div>
