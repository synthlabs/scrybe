<script lang="ts">
    import { cn } from "$lib/utils";

    interface Props {
        value: string;
        onChange: (next: string) => void;
    }

    let { value, onChange }: Props = $props();

    const PRESETS = [
        "#ffffff",
        "#f5d782",
        "#f5a572",
        "#a4d4ff",
        "#ffb1c8",
        "#c8c8cd",
    ];

    const isPreset = (hex: string) =>
        PRESETS.some((p) => p.toLowerCase() === hex.toLowerCase());
    let custom_active = $derived(!!value && !isPreset(value));
</script>

<div class="flex items-center gap-1.5">
    {#each PRESETS as hex}
        <button
            type="button"
            aria-label={hex}
            onclick={() => onChange(hex)}
            class={cn(
                "size-6 rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-scrybe-ring",
                value?.toLowerCase() === hex.toLowerCase()
                    ? "ring-2 ring-scrybe ring-offset-2 ring-offset-card border-transparent"
                    : "border-border/60 hover:scale-110",
            )}
            style="background-color: {hex};"
        ></button>
    {/each}
    <label
        class={cn(
            "relative inline-flex size-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border transition-all",
            custom_active
                ? "ring-2 ring-scrybe ring-offset-2 ring-offset-card border-transparent"
                : "border-border/60 hover:scale-110",
        )}
        style={custom_active
            ? `background-color: ${value};`
            : "background: conic-gradient(from 0deg, #ff5f5f, #ffce5f, #5fff8a, #5fc8ff, #b15fff, #ff5fb6, #ff5f5f);"}
    >
        <input
            type="color"
            value={value || "#ffffff"}
            onchange={(e) => onChange((e.target as HTMLInputElement).value)}
            class="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label="Custom color"
        />
    </label>
</div>
