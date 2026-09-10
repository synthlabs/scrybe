<script lang="ts">
    import { Switch } from "$lib/components/ui/switch/index.ts";
    import { Label } from "$lib/components/ui/label/index.ts";
    import Info from "@lucide/svelte/icons/info";
    import { m as msgs } from "$lib/paraglide/messages";
    let {
        id,
        label,
        description,
        details,
        checked,
        disabled = false,
        onchange,
    }: {
        id: string;
        label: string;
        description: string;
        details?: string;
        checked: boolean;
        disabled?: boolean;
        onchange: (value: boolean) => void;
    } = $props();
</script>

<div class="grid min-w-0 grid-cols-1 gap-1.5" data-settings-control={id}>
    <div class="flex items-start justify-between gap-4">
        <Label
            for={id}
            class="min-w-0 flex-1 cursor-pointer text-sm leading-6 font-medium"
            >{label}</Label
        >
        <Switch
            {id}
            {checked}
            {disabled}
            onCheckedChange={onchange}
            aria-describedby={`${id}-description`}
        />
    </div>
    <p id={`${id}-description`} class="text-muted-foreground text-sm leading-5">
        {description}
    </p>
    {#if details}
        <details class="text-muted-foreground text-xs leading-5">
            <summary
                class="focus-visible:outline-scrybe flex min-h-8 w-fit max-w-full cursor-pointer items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
            >
                <Info class="size-4 shrink-0" /><span class="min-w-0"
                    >{msgs.settings_technical_details()}</span
                >
            </summary>
            <p class="mt-1">{details}</p>
        </details>
    {/if}
</div>
