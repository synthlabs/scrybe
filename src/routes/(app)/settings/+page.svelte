<script lang="ts">
    import { Label } from "$lib/components/ui/label/index.ts";
    import { Input } from "$lib/components/ui/input/index.ts";
    import { Button } from "$lib/components/ui/button/index.ts";
    import { Slider } from "$lib/components/ui/slider/index.ts";
    import * as Select from "$lib/components/ui/select/index.ts";
    import ConsoleColumn from "$lib/components/console/console-column.svelte";
    import LivePreviewCard from "$lib/components/console/live-preview-card.svelte";
    import SegmentedControl from "$lib/components/console/segmented-control.svelte";
    import ToggleRow from "$lib/components/console/toggle-row.svelte";
    import Mic from "@lucide/svelte/icons/mic";
    import Cpu from "@lucide/svelte/icons/cpu";
    import Sparkles from "@lucide/svelte/icons/sparkles";
    import Search from "@lucide/svelte/icons/search";
    import Folder from "@lucide/svelte/icons/folder";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import ChevronUp from "@lucide/svelte/icons/chevron-up";
    import Copy from "@lucide/svelte/icons/copy";
    import Check from "@lucide/svelte/icons/check";
    import { open } from "@tauri-apps/plugin-dialog";
    import { toast } from "svelte-sonner";
    import { SyncedState } from "tauri-svelte-synced-store";
    import { DefaultAppState, DefaultInternalState } from "$lib/defaults";
    import {
        commands,
        type AppState,
        type AudioDevice,
        type InternalState,
        type ModelPreset,
        type WhisperToggles,
    } from "$lib/bindings";
    import Logger from "$utils/log";
    import { m as msgs } from "$lib/paraglide/messages";

    let app_state = new SyncedState<AppState>("app_state", DefaultAppState);
    let internal_state = new SyncedState<InternalState>(
        "internal_state",
        DefaultInternalState,
    );

    type IndexedToggle = WhisperToggles & { [key: string]: boolean };
    let store_toggles = $derived(
        app_state.obj.whisper_params.toggles as IndexedToggle,
    );

    interface ToggleMeta {
        key: keyof WhisperToggles;
        label: () => string;
        description: () => string;
        advanced: boolean;
        default_on: boolean;
    }

    const TOGGLES: ToggleMeta[] = [
        {
            key: "translate",
            label: msgs.settings_toggle_translate_label,
            description: msgs.settings_toggle_translate_desc,
            advanced: false,
            default_on: false,
        },
        {
            key: "suppress_blanks",
            label: msgs.settings_toggle_suppress_blanks_label,
            description: msgs.settings_toggle_suppress_blanks_desc,
            advanced: false,
            default_on: true,
        },
        {
            key: "token_timestamps",
            label: msgs.settings_toggle_token_timestamps_label,
            description: msgs.settings_toggle_token_timestamps_desc,
            advanced: false,
            default_on: true,
        },
        {
            key: "single_segment",
            label: msgs.settings_toggle_single_segment_label,
            description: msgs.settings_toggle_single_segment_desc,
            advanced: false,
            default_on: true,
        },
        {
            key: "split_on_word",
            label: msgs.settings_toggle_split_on_word_label,
            description: msgs.settings_toggle_split_on_word_desc,
            advanced: true,
            default_on: false,
        },
        {
            key: "print_special",
            label: msgs.settings_toggle_print_special_label,
            description: msgs.settings_toggle_print_special_desc,
            advanced: true,
            default_on: false,
        },
        {
            key: "print_progress",
            label: msgs.settings_toggle_print_progress_label,
            description: msgs.settings_toggle_print_progress_desc,
            advanced: true,
            default_on: false,
        },
        {
            key: "tdrz_enable",
            label: msgs.settings_toggle_tdrz_label,
            description: msgs.settings_toggle_tdrz_desc,
            advanced: true,
            default_on: false,
        },
    ];

    const ESSENTIAL_TOGGLES = TOGGLES.filter((t) => !t.advanced);
    const ADVANCED_TOGGLES = TOGGLES.filter((t) => t.advanced);

    const default_toggle_state = (): WhisperToggles =>
        TOGGLES.reduce((acc, t) => {
            acc[t.key] = t.default_on;
            return acc;
        }, {} as IndexedToggle) as WhisperToggles;

    let search = $state("");
    let show_advanced = $state(false);

    const matchesSearch = (label: string, description: string): boolean => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            label.toLowerCase().includes(q) ||
            description.toLowerCase().includes(q)
        );
    };

    let dirty = $derived.by(() => {
        const defaults = default_toggle_state() as IndexedToggle;
        return TOGGLES.some((t) => store_toggles[t.key] !== defaults[t.key]);
    });

    const onResetDefaults = () => {
        const defaults = default_toggle_state();
        app_state.obj.whisper_params.toggles = defaults;
        app_state.sync();
        toast.success(msgs.settings_reset_button());
    };

    const onSave = () => {
        // Changes are auto-applied via app_state.sync(); button serves as
        // a UX acknowledgement of the dirty state.
        // TODO: switch to buffered-save semantics if backend ever supports it.
        toast.success(msgs.settings_save_button());
    };

    let audio_devices: AudioDevice[] = $state([]);
    let device_selector_disabled = $derived(
        internal_state.obj.transcribe_running,
    );

    commands
        .getAudioDevices()
        .then((result) => {
            if (result.status === "ok") {
                audio_devices = result.data;
            } else {
                Logger.error("failed to get audio devices", result.error);
            }
        })
        .catch(Logger.error);

    let device_trigger = $derived(
        audio_devices.find((d) => d.id === app_state.obj.current_device.id)
            ?.name ?? msgs.audio_device_default(),
    );

    const onDeviceChange = (device_id: string) => {
        const next = audio_devices.find((d) => d.id === device_id) ?? {
            id: device_id,
            name: msgs.audio_device_default(),
        };
        app_state.obj.current_device = next;
        app_state.sync();
    };

    let model_presets: ModelPreset[] = $state([]);
    let selected_preset_id = $state("");
    let downloading_preset = $state(false);

    commands
        .listModelPresets()
        .then((list) => (model_presets = list))
        .catch(Logger.error);

    $effect(() => {
        if (!app_state.ready) return;
        if (downloading_preset) return;
        if (model_presets.length === 0) return;
        const path = app_state.obj.model_path;
        const match = model_presets.find(
            (p) =>
                path.endsWith("/" + p.filename) ||
                path.endsWith("\\" + p.filename),
        );
        selected_preset_id = match?.id ?? "";
    });

    const preset_trigger = $derived(
        model_presets.find((p) => p.id === selected_preset_id)?.label ??
            msgs.settings_model_preset_choose(),
    );

    const onPresetChange = async (id: string) => {
        if (!id || downloading_preset) return;
        selected_preset_id = id;
        downloading_preset = true;
        const preset = model_presets.find((p) => p.id === id);
        const label = preset?.label ?? id;
        const toast_id = toast.loading(msgs.toast_downloading({ label }), {
            duration: Number.POSITIVE_INFINITY,
        });
        try {
            const result = await commands.downloadModelPreset(id);
            if (result.status === "ok") {
                app_state.obj.model_path = result.data;
                app_state.sync();
                toast.success(msgs.toast_loaded({ label }), {
                    id: toast_id,
                    duration: 4000,
                });
            } else {
                Logger.error("preset download failed", result.error);
                toast.error(
                    msgs.toast_download_failed({
                        label,
                        error: String(result.error),
                    }),
                    { id: toast_id, duration: 6000 },
                );
            }
        } catch (e) {
            Logger.error("preset download threw", e);
            toast.error(
                msgs.toast_download_failed({ label, error: String(e) }),
                { id: toast_id, duration: 6000 },
            );
        } finally {
            downloading_preset = false;
        }
    };

    const select_file = async () => {
        const selected = await open({
            directory: false,
            multiple: false,
            filters: [
                {
                    name: msgs.settings_dialog_model_file(),
                    extensions: ["bin"],
                },
            ],
        });
        if (Array.isArray(selected) || selected === null) return;
        app_state.obj.model_path = selected;
        app_state.sync();
    };

    let cache_copied = $state(false);
    let cache_copied_timer: ReturnType<typeof setTimeout> | null = null;
    const copy_cache_path = async () => {
        const path = app_state.obj.model_path;
        if (!path) return;
        try {
            await navigator.clipboard.writeText(path);
            cache_copied = true;
            toast.success(msgs.settings_cache_copied());
            if (cache_copied_timer) clearTimeout(cache_copied_timer);
            cache_copied_timer = setTimeout(() => (cache_copied = false), 1400);
        } catch (e) {
            Logger.error("clipboard write failed", e);
        }
    };

    const LANGUAGE_OPTIONS = [
        { value: "auto", label: "auto" },
        { value: "en", label: "en" },
        { value: "ru", label: "ru" },
    ];

    let segment_size = $derived(app_state.obj.audio_segment_size || 15);

    let preview_segments = $derived.by(() => {
        const lang = app_state.obj.whisper_params.language;
        const ru = lang === "ru";
        const sourceLines = ru
            ? [
                  "Привет, добро пожаловать в стрим.",
                  "Сегодня мы попробуем новую игру.",
              ]
            : [
                  "Hey, welcome to the stream today,",
                  "we are gonna try out this new game.",
              ];
        const translatedLines = [
            "Hey, welcome to the stream today,",
            "we are gonna try out this new game.",
        ];
        const lines = store_toggles.translate ? translatedLines : sourceLines;
        if (store_toggles.single_segment) return [lines.join(" ")];
        if (store_toggles.split_on_word) {
            return lines.join(" ").split(/\s+/);
        }
        return lines;
    });

    const fmtTimestamp = (i: number) => {
        const totalMs = i * 800;
        const s = (totalMs / 1000).toFixed(1);
        return `00:0${s}`;
    };
</script>

<div class="product-scrybe flex flex-col gap-4 p-4">
    <div class="flex items-start justify-between gap-4">
        <div class="flex flex-col gap-1">
            <h1 class="text-2xl leading-tight font-semibold">
                {msgs.sidebar_settings()}
            </h1>
            <p class="text-muted-foreground text-sm">
                {msgs.settings_subtitle()}
            </p>
        </div>
        <div class="flex items-center gap-2">
            <div class="relative">
                <Search
                    class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                />
                <Input
                    type="search"
                    placeholder={msgs.settings_search_placeholder()}
                    bind:value={search}
                    class="h-8 w-52 pl-8 text-xs"
                />
            </div>
            {#if dirty}
                <Button
                    variant="ghost"
                    size="sm"
                    class="h-8"
                    onclick={onResetDefaults}
                >
                    {msgs.settings_reset_button()}
                </Button>
                <Button
                    size="sm"
                    class="bg-scrybe text-primary-foreground hover:bg-scrybe-press h-8"
                    onclick={onSave}
                >
                    {msgs.settings_save_button()}
                </Button>
            {/if}
        </div>
    </div>

    <LivePreviewCard subtitle={msgs.settings_live_preview_subtitle()}>
        {#snippet pills()}
            {#if store_toggles.translate}
                <span
                    class="border-scrybe/30 bg-scrybe-soft text-scrybe-ring rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
                >
                    → EN
                </span>
            {/if}
            {#if store_toggles.single_segment}
                <span
                    class="border-border/60 text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium"
                >
                    1 segment
                </span>
            {/if}
            {#if store_toggles.split_on_word}
                <span
                    class="border-border/60 text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium"
                >
                    per-word
                </span>
            {/if}
        {/snippet}
        <div
            class="border-scrybe/30 bg-scrybe-soft/40 rounded border px-3 py-2 text-[13px] leading-snug"
        >
            {#each preview_segments as seg, i (i + seg)}
                <span
                    class="animate-scrybe-cap-in inline-block pr-1 align-baseline"
                >
                    {#if store_toggles.token_timestamps}
                        <span
                            class="bg-scrybe/20 text-scrybe-ring mr-1 rounded px-1 py-0.5 font-mono text-[10px]"
                        >
                            {fmtTimestamp(i)}
                        </span>
                    {/if}
                    {seg}
                </span>
            {/each}
        </div>
    </LivePreviewCard>

    <div
        class="bg-card grid overflow-hidden rounded-md border"
        style="grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr);"
    >
        <ConsoleColumn icon={Mic} label={msgs.settings_audio_heading()}>
            <div class="flex flex-col gap-1.5">
                <Label
                    for="device-select"
                    class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                >
                    {msgs.audio_device_label()}
                </Label>
                <Select.Root
                    type="single"
                    onValueChange={onDeviceChange}
                    bind:value={app_state.obj.current_device.id}
                    disabled={device_selector_disabled}
                >
                    <Select.Trigger id="device-select" class="h-9">
                        {device_trigger}
                    </Select.Trigger>
                    <Select.Content>
                        {#each audio_devices as device (device.id)}
                            <Select.Item value={device.id} label={device.name}>
                                {device.name}
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </div>
            <div class="flex flex-col gap-1.5">
                <div class="flex items-baseline justify-between">
                    <Label
                        for="segment-size"
                        class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                    >
                        {msgs.settings_audio_segment_size()}
                    </Label>
                    <span class="text-foreground font-mono text-xs">
                        {segment_size}s
                    </span>
                </div>
                <Slider
                    id="segment-size"
                    type="single"
                    value={segment_size}
                    min={5}
                    max={60}
                    step={1}
                    onValueChange={(v) => {
                        app_state.obj.audio_segment_size = v;
                        app_state.sync();
                    }}
                />
                <div
                    class="text-muted-foreground flex justify-between text-[10px]"
                >
                    <span>{msgs.settings_audio_segment_responsive()}</span>
                    <span>{msgs.settings_audio_segment_accurate()}</span>
                </div>
            </div>
        </ConsoleColumn>

        <ConsoleColumn icon={Cpu} label={msgs.settings_model_heading()}>
            <div class="flex flex-col gap-1.5">
                <Label
                    for="model-preset"
                    class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                >
                    {msgs.settings_model_preset_label()}
                </Label>
                <Select.Root
                    type="single"
                    bind:value={selected_preset_id}
                    onValueChange={onPresetChange}
                    name="model-preset"
                    disabled={downloading_preset}
                >
                    <Select.Trigger id="model-preset" class="h-9">
                        {downloading_preset
                            ? msgs.settings_model_preset_downloading()
                            : preset_trigger}
                    </Select.Trigger>
                    <Select.Content>
                        {#each model_presets as preset (preset.id)}
                            <Select.Item value={preset.id} label={preset.label}>
                                <div class="flex flex-col">
                                    <span>{preset.label}</span>
                                    <span class="text-muted-foreground text-xs">
                                        {preset.description}
                                    </span>
                                </div>
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </div>
            <div class="flex flex-col gap-1.5">
                <Label
                    class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                >
                    {msgs.settings_model_location_label()}
                </Label>
                <Button
                    variant="outline"
                    size="sm"
                    class="h-9 justify-start gap-2 border-dashed"
                    onclick={select_file}
                >
                    <Folder class="size-4" />
                    {msgs.settings_model_choose_file()}
                </Button>
            </div>
            <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between">
                    <Label
                        class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                    >
                        {msgs.settings_model_cache_label()}
                    </Label>
                    <button
                        type="button"
                        onclick={copy_cache_path}
                        disabled={!app_state.obj.model_path}
                        aria-label={msgs.settings_cache_copy_aria()}
                        class="text-muted-foreground/70 hover:text-foreground focus-visible:text-foreground transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30"
                    >
                        {#if cache_copied}
                            <Check class="size-3.5 text-status-live" />
                        {:else}
                            <Copy class="size-3.5" />
                        {/if}
                    </button>
                </div>
                <div
                    class="border-border/60 bg-background/40 text-muted-foreground rounded border p-2 font-mono text-[11px] leading-snug break-all"
                >
                    {app_state.obj.model_path ||
                        msgs.settings_model_path_placeholder()}
                </div>
            </div>
        </ConsoleColumn>

        <ConsoleColumn
            icon={Sparkles}
            label={msgs.settings_whisper_heading()}
            count={msgs.settings_segment_count_summary({
                essential: ESSENTIAL_TOGGLES.length,
                advanced: ADVANCED_TOGGLES.length,
            })}
        >
            <div class="flex flex-col gap-1.5">
                <Label
                    class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase"
                >
                    {msgs.settings_transcription_language_label()}
                </Label>
                <SegmentedControl
                    options={LANGUAGE_OPTIONS}
                    value={app_state.obj.whisper_params.language || "auto"}
                    onChange={(v) => {
                        app_state.obj.whisper_params.language = v;
                        app_state.sync();
                    }}
                    ariaLabel="Transcription language"
                />
            </div>
            <div class="flex flex-col gap-1">
                {#each ESSENTIAL_TOGGLES as toggle (toggle.key)}
                    {@const label = toggle.label()}
                    {@const description = toggle.description()}
                    <ToggleRow
                        id={toggle.key}
                        {label}
                        {description}
                        bind:checked={store_toggles[toggle.key]}
                        onChange={() => app_state.sync()}
                        match={matchesSearch(label, description)}
                    />
                {/each}
            </div>
            <div class="flex flex-col gap-1">
                <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-[11px] font-medium transition-colors"
                    onclick={() => (show_advanced = !show_advanced)}
                >
                    {#if show_advanced}
                        <ChevronUp class="size-3.5" />
                        {msgs.settings_hide_advanced()}
                    {:else}
                        <ChevronDown class="size-3.5" />
                        {msgs.settings_show_advanced()}
                    {/if}
                </button>
                {#if show_advanced}
                    {#each ADVANCED_TOGGLES as toggle (toggle.key)}
                        {@const label = toggle.label()}
                        {@const description = toggle.description()}
                        <ToggleRow
                            id={toggle.key}
                            {label}
                            {description}
                            bind:checked={store_toggles[toggle.key]}
                            onChange={() => app_state.sync()}
                            match={matchesSearch(label, description)}
                        />
                    {/each}
                {/if}
            </div>
        </ConsoleColumn>
    </div>
</div>
