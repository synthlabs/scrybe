<script lang="ts">
    import { cn } from "$lib/utils";

    interface Props {
        value: string;
        presets: string[];
        onChange: (next: string) => void;
        customLabel?: string;
    }

    let { value, presets, onChange, customLabel = "Custom color" }: Props =
        $props();

    const isPreset = (hex: string) =>
        presets.some((p) => p.toLowerCase() === hex.toLowerCase());
    let custom_active = $derived(!!value && !isPreset(value));
    let picker_value = $derived(
        /^#[\da-f]{6}$/i.test(value) ? value : "#ffffff",
    );
</script>

<div class="flex items-center gap-1.5">
    {#each presets as hex}
        <button
            type="button"
            aria-label={hex}
            onclick={() => onChange(hex)}
            class={cn(
                "size-6 cursor-pointer rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-scrybe-ring",
                value?.toLowerCase() === hex.toLowerCase()
                    ? "border-scrybe/70 ring-1 ring-scrybe/70 ring-offset-1 ring-offset-card"
                    : "border-border/60 hover:border-scrybe/50",
            )}
            style="background-color: {hex};"
        ></button>
    {/each}
    <label
        class={cn(
            "relative inline-flex size-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border transition-all",
            custom_active
                ? "border-scrybe/70 ring-1 ring-scrybe/70 ring-offset-1 ring-offset-card"
                : "border-border/60 hover:border-scrybe/50",
        )}
        style={custom_active
            ? `background-color: ${value};`
            : "background: conic-gradient(from 0deg, #ff5f5f, #ffce5f, #5fff8a, #5fc8ff, #b15fff, #ff5fb6, #ff5f5f);"}
    >
        <input
            type="color"
            value={picker_value}
            oninput={(e) => onChange((e.target as HTMLInputElement).value)}
            class="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label={customLabel}
        />
    </label>
</div>
