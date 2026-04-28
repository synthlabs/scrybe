<script lang="ts">
    import { Switch } from "$lib/components/ui/switch/index.ts";
    import { Label } from "$lib/components/ui/label/index.ts";
    import * as Tooltip from "$lib/components/ui/tooltip/index.ts";
    import Info from "@lucide/svelte/icons/info";
    import { cn } from "$lib/utils";

    interface Props {
        id: string;
        label: string;
        description: string;
        checked: boolean;
        onChange?: (next: boolean) => void;
        match?: boolean;
    }

    let {
        id,
        label,
        description,
        checked = $bindable(),
        onChange,
        match = true,
    }: Props = $props();
</script>

<div
    class={cn(
        "flex items-center gap-3 rounded-md border border-transparent px-3 py-2 transition-all duration-150",
        checked
            ? "border-scrybe/30 bg-scrybe-soft/40"
            : "hover:bg-accent/40",
        !match && "pointer-events-none opacity-30",
    )}
>
    <span
        class={cn(
            "size-1.5 shrink-0 rounded-full transition-colors",
            checked ? "bg-scrybe" : "bg-status-idle",
        )}
        aria-hidden="true"
    ></span>
    <Label
        for={id}
        id="{id}-label"
        class="flex-1 cursor-pointer text-xs font-medium"
    >
        {label}
    </Label>
    <Tooltip.Provider delayDuration={200}>
        <Tooltip.Root>
            <Tooltip.Trigger
                class="text-muted-foreground/70 hover:text-muted-foreground focus-visible:outline-none focus-visible:text-foreground"
                aria-label="More info"
            >
                <Info class="size-3.5" />
            </Tooltip.Trigger>
            <Tooltip.Content side="left" class="max-w-60 text-xs">
                {description}
            </Tooltip.Content>
        </Tooltip.Root>
    </Tooltip.Provider>
    <Switch
        {id}
        bind:checked
        aria-labelledby="{id}-label"
        onCheckedChange={onChange}
        class="scale-90"
    />
</div>
