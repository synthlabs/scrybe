<script lang="ts">
    import Mic from "@lucide/svelte/icons/mic";
    import { commands, type ModelPreset } from "$lib/bindings";
    import { m as msgs } from "$lib/paraglide/messages";
    import Logger from "$utils/log";
    import { app_state } from "$lib/stores/state.svelte";

    let model_presets = $state<ModelPreset[]>([]);
    commands
        .listModelPresets()
        .then((list) => (model_presets = list))
        .catch(Logger.error);

    let device_label = $derived(
        app_state.obj.current_device.name || msgs.audio_device_default(),
    );

    let model_label = $derived.by(() => {
        const path = app_state.obj.model_path;
        if (!path) return "—";
        const preset = model_presets.find(
            (p) =>
                path.endsWith("/" + p.filename) ||
                path.endsWith("\\" + p.filename),
        );
        if (preset) return preset.label;
        const basename = path.split(/[/\\]/).pop() ?? path;
        return basename.replace(/^ggml-|\.bin$/g, "");
    });
</script>

<div
    class="border-scrybe/30 bg-scrybe-soft text-scrybe-ring flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]"
>
    <span class="bg-scrybe size-1.5 rounded-full"></span>
    <span class="max-w-35 truncate">{model_label}</span>
</div>
<div
    class="border-border/60 bg-background/40 text-muted-foreground flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]"
>
    <Mic class="size-3" />
    <span class="max-w-35 truncate">{device_label}</span>
</div>
