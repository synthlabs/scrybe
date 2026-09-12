<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { open } from "@tauri-apps/plugin-dialog";
    import { ReportWizard } from "$utils/inbound";
    import { Button } from "$lib/components/ui/button/index.ts";
    import { Input } from "$lib/components/ui/input/index.ts";
    import { Label } from "$lib/components/ui/label/index.ts";
    import { Slider } from "$lib/components/ui/slider/index.ts";
    import * as Select from "$lib/components/ui/select/index.ts";
    import * as Sheet from "$lib/components/ui/sheet/index.ts";
    import * as Collapsible from "$lib/components/ui/collapsible/index.ts";
    import Disclosure from "$lib/components/overlay/disclosure.svelte";
    import SegmentedControl from "$lib/components/console/segmented-control.svelte";
    import ToggleField from "$lib/components/settings/toggle-field.svelte";
    import { Panel } from "$lib/components/ui/panel/index.ts";
    import Mic from "@lucide/svelte/icons/mic";
    import Brain from "@lucide/svelte/icons/brain";
    import LifeBuoy from "@lucide/svelte/icons/life-buoy";
    import {
        commands,
        type AudioDeviceOption,
        type AudioError,
        type ModelPreset,
        type SettingsErrorKind,
        type VadSensitivity,
        type WhisperToggles,
    } from "$lib/bindings";
    import { groupAudioDevices, savedAudioDevice } from "$lib/audio-devices";
    import { app_state } from "$lib/stores/state.svelte";
    import { settings_editor as editor } from "$lib/stores/settings-editor.svelte";
    import {
        matchesSettings,
        modelFilename,
        settingsValues,
    } from "$lib/settings/values.js";
    import { showActionError } from "$lib/home-errors";
    import { m as msgs } from "$lib/paraglide/messages";
    import Search from "@lucide/svelte/icons/search";
    import X from "@lucide/svelte/icons/x";
    import Copy from "@lucide/svelte/icons/copy";
    import Check from "@lucide/svelte/icons/check";
    import Folder from "@lucide/svelte/icons/folder";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import LoaderCircle from "@lucide/svelte/icons/loader-circle";
    import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

    let search = $state("");
    let devices: AudioDeviceOption[] = $state([]);
    let models: ModelPreset[] = $state([]);
    let devices_loading = $state(true);
    let models_loading = $state(true);
    let device_error: AudioError | null = $state(null);
    let devices_request: Promise<void> | null = null;
    let disposed = false;
    const device_groups = $derived(groupAudioDevices(devices));
    let model_error = $state("");
    let report_open = $state(false);
    let copied = $state(false);
    let footer_height = $state(0);
    let window_height = $state(0);
    let copy_timer: ReturnType<typeof setTimeout>;
    const values = $derived(editor.values);
    const disabled = $derived(!app_state.ready || editor.busy);
    const searching = $derived(Boolean(search.trim()));
    const selected_model = $derived(
        models.find(
            (model) =>
                model.filename === modelFilename(app_state.obj.model_path),
        ),
    );
    const pending_model = $derived.by(() => {
        const selection = editor.model;
        return selection?.kind === "preset"
            ? models.find((model) => model.id === selection.id)
            : null;
    });
    const displayed_path = $derived(
        editor.model?.kind === "file"
            ? editor.model.path
            : app_state.obj.model_path,
    );
    const missing_device = $derived(
        !devices_loading &&
            !device_error &&
            Boolean(values.current_device.id) &&
            !devices.some((device) => device.id === values.current_device.id),
    );
    const selected_device = $derived(
        devices.find((device) => device.id === values.current_device.id),
    );
    const device_label = $derived(
        selected_device
            ? optionLabel(selected_device)
            : values.current_device.id
              ? values.current_device.name
              : msgs.audio_device_default(),
    );
    const unsupported_device = $derived(
        missing_device && values.current_device.id.startsWith("alsa:"),
    );
    function optionLabel(device: AudioDeviceOption) {
        if (!device.is_default) return device.name;
        if (!device.kind) return msgs.audio_device_default();
        const name = device.name || msgs.audio_source_unavailable();
        return device.kind === "input"
            ? msgs.audio_default_input({ device: name })
            : msgs.audio_default_output({ device: name });
    }
    const model_label = $derived(
        selected_model?.label ??
            (app_state.obj.model_path
                ? msgs.settings_custom_model()
                : msgs.settings_no_model()),
    );
    const toggles: {
        key: keyof WhisperToggles;
        label: () => string;
        description: () => string;
        details?: () => string;
    }[] = [
        {
            key: "suppress_blanks",
            label: msgs.settings_toggle_suppress_blanks_label,
            description: msgs.settings_toggle_suppress_blanks_desc,
        },
        {
            key: "token_timestamps",
            label: msgs.settings_toggle_token_timestamps_label,
            description: msgs.settings_toggle_token_timestamps_desc,
            details: msgs.settings_timestamps_details,
        },
        {
            key: "single_segment",
            label: msgs.settings_toggle_single_segment_label,
            description: msgs.settings_toggle_single_segment_desc,
        },
        {
            key: "split_on_word",
            label: msgs.settings_toggle_split_on_word_label,
            description: msgs.settings_toggle_split_on_word_desc,
        },
        {
            key: "print_special",
            label: msgs.settings_toggle_print_special_label,
            description: msgs.settings_toggle_print_special_desc,
        },
        {
            key: "print_progress",
            label: msgs.settings_toggle_print_progress_label,
            description: msgs.settings_toggle_print_progress_desc,
        },
        {
            key: "tdrz_enable",
            label: msgs.settings_toggle_tdrz_label,
            description: msgs.settings_toggle_tdrz_desc,
            details: msgs.settings_speaker_details,
        },
    ];
    const error_messages: Record<SettingsErrorKind, () => string> = {
        busy: msgs.settings_error_busy,
        running: msgs.settings_stop_first,
        invalid_device: msgs.settings_error_device,
        invalid_value: msgs.settings_error_value,
        download: msgs.settings_error_download,
        model_load: msgs.settings_error_model,
        save: msgs.settings_error_save,
        internal: msgs.settings_error_save,
    };
    const model_descriptions: Record<string, () => string> = {
        "tiny-q8_0": msgs.settings_preset_tiny,
        "base-q8_0": msgs.settings_preset_base,
        "small-q8_0": msgs.settings_preset_small,
        "medium-q8_0": msgs.settings_preset_medium,
        "large-v3-turbo-q5_0": msgs.settings_preset_turbo_q5,
        "large-v3-turbo-q8_0": msgs.settings_preset_turbo_q8,
    };
    const presetDescription = (model: ModelPreset) =>
        model_descriptions[model.id]?.() ?? model.description;
    const match = (...terms: string[]) => matchesSettings(search, ...terms);
    const audio_match = $derived(
        match(
            msgs.settings_audio_heading(),
            msgs.audio_device_label(),
            msgs.settings_source_desc(),
            device_label,
            msgs.audio_group_inputs(),
            msgs.audio_group_outputs(),
            "audio input output playback source microphone current_device",
        ),
    );
    const segment_match = $derived(
        match(
            msgs.settings_audio_heading(),
            msgs.settings_audio_segment_size(),
            msgs.settings_segment_desc(),
            "audio_segment_size buffer duration",
        ),
    );
    const model_match = $derived(
        match(
            msgs.settings_model_heading(),
            msgs.settings_model_desc(),
            model_label,
            "model whisper",
        ),
    );
    const file_match = $derived(
        match(
            msgs.settings_model_heading(),
            msgs.settings_model_choose_file(),
            msgs.settings_model_path_label(),
            msgs.settings_custom_model(),
            displayed_path,
            "model_path custom bin file",
        ),
    );
    const protection_match = $derived(
        match(
            msgs.settings_model_heading(),
            msgs.settings_hallucination_protection_label(),
            msgs.settings_hallucination_protection_desc(),
            "hallucination_protection_enabled VAD noise filtering",
        ),
    );
    const sensitivity_match = $derived(
        match(
            msgs.settings_model_heading(),
            msgs.settings_vad_sensitivity_label(),
            msgs.settings_vad_sensitivity_desc(),
            "vad_sensitivity",
        ),
    );
    const matching_toggles = $derived(
        toggles.filter((toggle) =>
            match(
                msgs.settings_model_heading(),
                "Whisper",
                toggle.key,
                toggle.label(),
                toggle.description(),
                toggle.details?.() ?? "",
            ),
        ),
    );
    const matching_models = $derived(
        models.filter((model) =>
            match(
                msgs.settings_model_heading(),
                model.label,
                presetDescription(model),
                model.filename,
            ),
        ),
    );
    const advanced_match = $derived(
        file_match ||
            protection_match ||
            sensitivity_match ||
            matching_toggles.length > 0,
    );
    const support_match = $derived(
        match(
            msgs.settings_support_heading(),
            msgs.settings_bug_report_desc(),
            msgs.settings_bug_report_button(),
            "support bug report",
        ),
    );
    const any_match = $derived(
        audio_match ||
            segment_match ||
            model_match ||
            matching_models.length > 0 ||
            advanced_match ||
            support_match,
    );

    $effect(() => {
        if (!app_state.ready) return;
        const saved = settingsValues($state.snapshot(app_state.obj));
        untrack(() => editor.reconcile(saved));
    });
    onMount(() => {
        disposed = false;
        void loadDevices();
        void loadModels();
        const refresh = () => {
            if (!document.hidden) void loadDevices(true);
        };
        const timer = setInterval(refresh, 2000);
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        return () => {
            disposed = true;
            clearTimeout(copy_timer);
            clearInterval(timer);
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
        };
    });
    function loadDevices(background = false): Promise<void> {
        if (devices_request) return devices_request;
        if (!background) devices_loading = true;
        devices_request = (async () => {
            try {
                const result = await commands.getAudioDevices();
                if (disposed) return;
                if (result.status === "error") throw result.error;
                if (JSON.stringify(devices) !== JSON.stringify(result.data))
                    devices = result.data;
                device_error = null;
            } catch (error) {
                if (disposed) return;
                device_error =
                    error && typeof error === "object" && "kind" in error
                        ? (error as AudioError)
                        : {
                              kind: "service_unavailable",
                              details: String(error),
                          };
            } finally {
                if (!disposed) devices_loading = false;
                devices_request = null;
            }
        })();
        return devices_request;
    }
    async function loadModels() {
        models_loading = true;
        model_error = "";
        try {
            models = await commands.listModelPresets();
        } catch (error) {
            model_error = String(error);
        } finally {
            models_loading = false;
        }
    }
    function changeDevice(id: string) {
        const device = devices.find((device) => device.id === id);
        if (device)
            editor.edit({
                ...values,
                current_device: savedAudioDevice(device),
            });
    }
    function toggle(key: keyof WhisperToggles, checked: boolean) {
        editor.edit({
            ...values,
            whisper_params: {
                toggles: { ...values.whisper_params.toggles, [key]: checked },
            },
        });
    }
    async function chooseFile() {
        try {
            const path = await open({
                directory: false,
                multiple: false,
                filters: [
                    {
                        name: msgs.settings_dialog_model_file(),
                        extensions: ["bin"],
                    },
                ],
            });
            if (typeof path === "string")
                editor.chooseModel(
                    path === app_state.obj.model_path
                        ? null
                        : { kind: "file", path },
                );
        } catch (error) {
            showActionError(
                msgs.settings_file_error(),
                msgs.settings_retry_help(),
                error,
            );
        }
    }
    async function copyPath() {
        try {
            await navigator.clipboard.writeText(displayed_path);
            copied = true;
            clearTimeout(copy_timer);
            copy_timer = setTimeout(() => (copied = false), 1500);
        } catch (error) {
            showActionError(
                msgs.settings_copy_error(),
                msgs.settings_retry_help(),
                error,
            );
        }
    }
    async function apply() {
        await editor.apply();
    }
</script>

<svelte:window bind:innerHeight={window_height} />

<div
    class="product-scrybe flex min-h-full flex-col wrap-anywhere"
    data-settings-editor
>
    <div class="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-8 sm:px-6">
        <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 class="text-xl font-semibold">{msgs.sidebar_settings()}</h1>
                <p class="text-muted-foreground mt-2 text-sm leading-5">
                    {msgs.settings_subtitle()}
                </p>
            </div>
            <div class="relative w-full sm:w-64">
                <Search
                    class="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4"
                />
                <Input
                    id="settings-search"
                    type="search"
                    aria-label={msgs.settings_search_placeholder()}
                    placeholder={msgs.settings_search_placeholder()}
                    bind:value={search}
                    class="pr-10 pl-9"
                />
                {#if search}
                    <Button
                        variant="ghost"
                        size="icon"
                        class="absolute top-0.5 right-0.5 size-8"
                        aria-label={msgs.settings_clear_search()}
                        onclick={() => (search = "")}
                        ><X class="size-4" /></Button
                    >
                {/if}
            </div>
        </div>
        {#if !any_match}
            <div
                class="text-muted-foreground py-8 text-sm"
                role="status"
                data-settings-no-results
            >
                <p>{msgs.settings_no_results()}</p>
                <Button
                    class="mt-3"
                    variant="outline"
                    size="sm"
                    onclick={() => (search = "")}
                    >{msgs.settings_clear_search()}</Button
                >
            </div>
        {/if}
        {#if audio_match || segment_match}
            <Panel
                aria-labelledby="settings-audio-heading"
                class="mb-7"
                data-settings-section="audio"
            >
                <h2
                    id="settings-audio-heading"
                    class="mb-4 flex items-center gap-2 text-base font-semibold"
                >
                    <Mic
                        class="text-muted-foreground size-5 shrink-0"
                        aria-hidden="true"
                    />
                    {msgs.settings_audio_heading()}
                </h2>
                {#if audio_match}
                    <div class="mb-5 grid grid-cols-1 gap-2">
                        <div
                            class="flex flex-wrap items-center justify-between gap-3"
                        >
                            <Label for="device-select"
                                >{msgs.audio_device_label()}</Label
                            >
                            <Button
                                id="settings-refresh-devices"
                                variant="ghost"
                                size="sm"
                                disabled={disabled || devices_loading}
                                onclick={() => loadDevices()}
                                >{msgs.settings_refresh()}</Button
                            >
                        </div>
                        <Select.Root
                            type="single"
                            value={values.current_device.id}
                            onValueChange={changeDevice}
                            disabled={disabled ||
                                devices_loading ||
                                Boolean(device_error)}
                        >
                            <Select.Trigger
                                id="device-select"
                                aria-describedby="settings-source-description"
                                class="h-auto min-h-9 text-left [&>span]:min-w-0 [&>span]:truncate"
                            >
                                {devices_loading
                                    ? msgs.settings_loading()
                                    : device_label}
                            </Select.Trigger>
                            <Select.Content
                                bounded
                                class="settings-device-menu [&_[data-select-viewport]]:[overflow-anchor:none]"
                                collisionPadding={16}
                            >
                                {#if (missing_device || device_error) && values.current_device.id && !devices.some((device) => device.id === values.current_device.id)}
                                    <Select.Item
                                        value={values.current_device.id}
                                        disabled
                                        label={device_label}
                                    />
                                {/if}
                                {#each device_groups as group (group.kind)}
                                    <Select.Group>
                                        {#if group.kind}
                                            <Select.GroupHeading
                                                >{group.kind === "input"
                                                    ? msgs.audio_group_inputs()
                                                    : msgs.audio_group_outputs()}</Select.GroupHeading
                                            >
                                        {/if}
                                        {#each group.devices as device (device.id)}
                                            <Select.Item
                                                value={device.id}
                                                label={optionLabel(device)}
                                                disabled={device.is_default &&
                                                    device.kind !== null &&
                                                    !device.name}
                                                class="break-words whitespace-normal"
                                            />
                                        {/each}
                                    </Select.Group>
                                {/each}
                            </Select.Content>
                        </Select.Root>
                        <p
                            id="settings-source-description"
                            class="text-muted-foreground text-sm leading-5"
                        >
                            {msgs.settings_source_desc()}
                        </p>
                        {#if device_error}<p
                                class="text-destructive text-sm"
                                role="alert"
                            >
                                {device_error.kind === "service_unavailable"
                                    ? msgs.audio_service_unavailable()
                                    : msgs.settings_devices_error()}
                            </p>{/if}
                        {#if missing_device}<p
                                class="text-status-warn text-sm"
                                role="status"
                            >
                                {unsupported_device
                                    ? msgs.audio_legacy_device()
                                    : msgs.settings_device_missing()}
                            </p>{/if}
                    </div>
                {/if}
                {#if segment_match}
                    <Disclosure
                        id="settings-audio-advanced"
                        title={msgs.settings_advanced()}
                        locked={searching}
                        open={searching || editor.audio_open}
                        onOpenChange={(open) => {
                            if (!searching) editor.audio_open = open;
                        }}
                    >
                        <div
                            class="grid grid-cols-1 gap-3"
                            data-settings-control="segment-size"
                        >
                            <div
                                class="flex items-baseline justify-between gap-4"
                            >
                                <Label for="segment-size"
                                    >{msgs.settings_audio_segment_size()}</Label
                                >
                                <span
                                    class="text-muted-foreground shrink-0 font-mono text-xs"
                                    >{msgs.settings_seconds({
                                        seconds: values.audio_segment_size,
                                    })}</span
                                >
                            </div>
                            <Slider
                                id="segment-size"
                                type="single"
                                value={values.audio_segment_size}
                                min={5}
                                max={60}
                                step={1}
                                {disabled}
                                aria-label={msgs.settings_audio_segment_size()}
                                aria-valuetext={msgs.settings_seconds({
                                    seconds: values.audio_segment_size,
                                })}
                                onValueChange={(value) =>
                                    editor.edit({
                                        ...values,
                                        audio_segment_size: value,
                                    })}
                            />
                            <p class="text-muted-foreground text-sm leading-5">
                                {msgs.settings_segment_desc()}
                            </p>
                        </div>
                    </Disclosure>
                {/if}
            </Panel>
        {/if}
        {#if model_match || matching_models.length || advanced_match}
            <Panel
                aria-labelledby="settings-model-heading"
                class="mb-7"
                data-settings-section="model"
            >
                <h2
                    id="settings-model-heading"
                    class="mb-4 flex items-center gap-2 text-base font-semibold"
                >
                    <Brain
                        class="text-muted-foreground size-5 shrink-0"
                        aria-hidden="true"
                    />
                    {msgs.settings_model_heading()}
                </h2>
                {#if model_match || matching_models.length}
                    <Collapsible.Root
                        class="mb-5"
                        open={searching || editor.choices_open}
                    >
                        <div
                            class="flex flex-wrap items-center justify-between gap-3"
                        >
                            <div class="min-w-0">
                                <p class="text-muted-foreground mb-1 text-xs">
                                    {msgs.settings_current_model()}
                                </p>
                                <p class="text-sm font-medium break-words">
                                    {model_label}
                                </p>
                                {#if !selected_model && app_state.obj.model_path}<p
                                        class="text-muted-foreground mt-1 text-xs break-all"
                                    >
                                        {modelFilename(
                                            app_state.obj.model_path,
                                        )}
                                    </p>{/if}
                            </div>
                            <Button
                                id="settings-change-model"
                                variant="outline"
                                size="sm"
                                aria-expanded={searching || editor.choices_open}
                                aria-controls="settings-model-choices"
                                onclick={() =>
                                    (editor.choices_open =
                                        !editor.choices_open)}
                            >
                                {msgs.settings_change_model()}<ChevronDown
                                    class={`size-4 transition-transform duration-(--scrybe-duration-standard) ease-out ${searching || editor.choices_open ? "rotate-180" : ""}`}
                                />
                            </Button>
                        </div>
                        <p class="text-muted-foreground mt-3 text-sm leading-5">
                            {msgs.settings_model_desc()}
                        </p>
                        <Collapsible.Content
                            id="settings-model-choices"
                            class="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up -mx-1 overflow-hidden px-1 duration-(--scrybe-duration-standard) ease-out"
                        >
                            <div class="grid grid-cols-1 gap-2 pt-4 pb-1">
                                {#if models_loading}<p
                                        class="text-muted-foreground text-sm"
                                        role="status"
                                    >
                                        {msgs.settings_loading()}
                                    </p>{/if}
                                {#if model_error}
                                    <p
                                        class="text-destructive text-sm"
                                        role="alert"
                                    >
                                        {msgs.settings_models_error()}
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        class="w-fit"
                                        onclick={loadModels}
                                        >{msgs.settings_retry()}</Button
                                    >
                                {/if}
                                <div
                                    role="radiogroup"
                                    aria-label={msgs.settings_change_model()}
                                    class="grid grid-cols-1 gap-2"
                                >
                                    {#each matching_models as model (model.id)}
                                        {@const selected =
                                            editor.model?.kind === "preset"
                                                ? editor.model.id === model.id
                                                : editor.model === null &&
                                                  selected_model?.id ===
                                                      model.id}
                                        <label
                                            class={`focus-within:ring-ring focus-within:ring-offset-background border-border flex cursor-pointer items-start gap-3 rounded-md border p-3 focus-within:ring-2 focus-within:ring-offset-2 ${selected ? "bg-scrybe-soft" : "hover:bg-accent/40"} ${disabled ? "pointer-events-none opacity-50" : ""}`}
                                        >
                                            <input
                                                type="radio"
                                                name="settings-model"
                                                class="accent-scrybe mt-1 size-4 shrink-0"
                                                value={model.id}
                                                checked={selected}
                                                {disabled}
                                                onchange={() =>
                                                    editor.chooseModel(
                                                        selected_model?.id ===
                                                            model.id
                                                            ? null
                                                            : {
                                                                  kind: "preset",
                                                                  id: model.id,
                                                              },
                                                    )}
                                            />
                                            <span
                                                class="min-w-0 flex-1 text-sm"
                                            >
                                                <span
                                                    class="flex flex-wrap justify-between gap-x-3 gap-y-1"
                                                    ><span class="font-medium"
                                                        >{model.label}</span
                                                    ><span
                                                        class="text-muted-foreground text-xs"
                                                        >{msgs.settings_model_size(
                                                            {
                                                                size: model.size_mb,
                                                            },
                                                        )}</span
                                                    ></span
                                                >
                                                <span
                                                    class="text-muted-foreground mt-1 block leading-5"
                                                    >{presetDescription(
                                                        model,
                                                    )}</span
                                                >
                                            </span>
                                        </label>
                                    {/each}
                                </div>
                            </div>
                        </Collapsible.Content>
                    </Collapsible.Root>
                {/if}
                {#if editor.model}
                    <p
                        class="border-border bg-background mb-5 rounded-md border p-3 text-sm leading-5"
                        role="status"
                        data-settings-pending-model
                    >
                        {#if editor.model.kind === "preset"}
                            {msgs.settings_pending_preset({
                                model: pending_model?.label ?? editor.model.id,
                                size: pending_model?.size_mb ?? 0,
                            })}
                        {:else}
                            {msgs.settings_pending_file({
                                file: modelFilename(editor.model.path),
                            })}
                        {/if}
                    </p>
                {/if}
                {#if advanced_match}
                    <Disclosure
                        id="settings-model-advanced"
                        title={msgs.settings_advanced()}
                        locked={searching}
                        open={searching || editor.model_open}
                        onOpenChange={(open) => {
                            if (!searching) editor.model_open = open;
                        }}
                    >
                        {#if file_match}
                            <div
                                class="grid grid-cols-1 gap-3"
                                data-settings-control="model-file"
                            >
                                <div
                                    class="flex flex-wrap items-center justify-between gap-3"
                                >
                                    <p class="text-sm font-medium">
                                        {msgs.settings_custom_model()}
                                    </p>
                                    <Button
                                        id="settings-choose-file"
                                        variant="outline"
                                        size="sm"
                                        {disabled}
                                        onclick={chooseFile}
                                        ><Folder
                                            class="size-4"
                                        />{msgs.settings_model_choose_file()}</Button
                                    >
                                </div>
                                <p
                                    class="text-muted-foreground text-sm leading-5"
                                >
                                    {msgs.settings_custom_desc()}
                                </p>
                                <div
                                    class="flex flex-wrap items-center justify-between gap-3"
                                >
                                    <p class="text-muted-foreground text-xs">
                                        {msgs.settings_model_path_label()}
                                    </p>
                                    <Button
                                        id="settings-copy-path"
                                        variant="ghost"
                                        size="sm"
                                        disabled={!displayed_path}
                                        onclick={copyPath}
                                        >{#if copied}<Check
                                                class="size-4"
                                            />{:else}<Copy
                                                class="size-4"
                                            />{/if}{copied
                                            ? msgs.settings_cache_copied()
                                            : msgs.settings_cache_copy_aria()}</Button
                                    >
                                </div>
                                <p
                                    class="bg-background border-border rounded-md border p-3 font-mono text-xs leading-5 break-all"
                                >
                                    {displayed_path ||
                                        msgs.settings_model_path_placeholder()}
                                </p>
                            </div>
                        {/if}
                        {#if protection_match}
                            <ToggleField
                                id="hallucination-protection"
                                label={msgs.settings_hallucination_protection_label()}
                                description={msgs.settings_hallucination_protection_desc()}
                                checked={values.advanced_settings
                                    .hallucination_protection_enabled}
                                {disabled}
                                onchange={(value) =>
                                    editor.edit({
                                        ...values,
                                        advanced_settings: {
                                            ...values.advanced_settings,
                                            hallucination_protection_enabled:
                                                value,
                                        },
                                    })}
                            />
                        {/if}
                        {#if sensitivity_match}
                            <div
                                class="grid grid-cols-1 gap-2"
                                data-settings-control="vad-sensitivity"
                            >
                                <p
                                    id="settings-sensitivity-label"
                                    class="text-sm font-medium"
                                >
                                    {msgs.settings_vad_sensitivity_label()}
                                </p>
                                <SegmentedControl
                                    options={[
                                        {
                                            value: "sensitive",
                                            label: msgs.settings_vad_sensitive(),
                                        },
                                        {
                                            value: "balanced",
                                            label: msgs.settings_vad_balanced(),
                                        },
                                        {
                                            value: "strict",
                                            label: msgs.settings_vad_strict(),
                                        },
                                    ]}
                                    value={values.advanced_settings
                                        .vad_sensitivity}
                                    disabled={disabled ||
                                        !values.advanced_settings
                                            .hallucination_protection_enabled}
                                    ariaLabel={msgs.settings_vad_sensitivity_label()}
                                    class="h-auto flex-wrap [&>button]:min-w-0 [&>button]:flex-1 [&>button]:basis-28 [&>button]:whitespace-normal"
                                    onChange={(value) =>
                                        editor.edit({
                                            ...values,
                                            advanced_settings: {
                                                ...values.advanced_settings,
                                                vad_sensitivity:
                                                    value as VadSensitivity,
                                            },
                                        })}
                                />
                                <p
                                    class="text-muted-foreground text-sm leading-5"
                                >
                                    {msgs.settings_vad_sensitivity_desc()}
                                </p>
                                {#if !values.advanced_settings.hallucination_protection_enabled}<p
                                        class="text-muted-foreground text-xs"
                                    >
                                        {msgs.settings_enable_filtering()}
                                    </p>{/if}
                            </div>
                        {/if}
                        {#each matching_toggles as item (item.key)}
                            <ToggleField
                                id={item.key}
                                label={item.label()}
                                description={item.description()}
                                details={item.details?.()}
                                checked={values.whisper_params.toggles[
                                    item.key
                                ]}
                                {disabled}
                                onchange={(value) => toggle(item.key, value)}
                            />
                        {/each}
                    </Disclosure>
                {/if}
            </Panel>
        {/if}
        {#if support_match}
            <Panel
                aria-labelledby="settings-support-heading"
                data-settings-section="support"
            >
                <h2
                    id="settings-support-heading"
                    class="flex items-center gap-2 text-base font-semibold"
                >
                    <LifeBuoy
                        class="text-muted-foreground size-5 shrink-0"
                        aria-hidden="true"
                    />
                    {msgs.settings_support_heading()}
                </h2>
                <p class="text-muted-foreground mt-2 text-sm leading-5">
                    {msgs.settings_bug_report_desc()}
                </p>
                <Button
                    id="settings-report"
                    variant="outline"
                    size="sm"
                    class="mt-4"
                    onclick={() => (report_open = true)}
                    >{msgs.settings_bug_report_button()}</Button
                >
            </Panel>
        {/if}
    </div>
    <footer
        bind:clientHeight={footer_height}
        class:sticky={footer_height < window_height * 0.4}
        class="settings-footer border-border bg-background bottom-0 z-20 border-t py-3"
    >
        <div class="grid min-w-0 gap-3">
            {#if editor.error || editor.requires_stop}
                <div class="mx-auto grid w-full max-w-3xl min-w-0 gap-3 px-4">
                    {#if editor.error}
                        <div
                            class="grid grid-cols-1 gap-2 text-sm"
                            data-settings-error
                        >
                            <p class="text-destructive" role="alert">
                                {error_messages[editor.error.kind]()}
                            </p>
                            <p class="text-muted-foreground">
                                {msgs.settings_error_pending()}
                            </p>
                            <details class="text-muted-foreground text-xs">
                                <summary
                                    class="focus-visible:outline-scrybe w-fit cursor-pointer rounded-md py-1 focus-visible:outline-2"
                                    >{msgs.settings_technical_details()}</summary
                                >
                                <pre
                                    class="mt-2 max-h-32 overflow-auto font-mono leading-5 break-words whitespace-pre-wrap">{editor
                                        .error.details}</pre>
                            </details>
                        </div>
                    {/if}
                    {#if editor.requires_stop}<p
                            class="text-status-warn text-sm leading-5"
                            role="status"
                            id="settings-stop-notice"
                        >
                            {msgs.settings_stop_first()}
                        </p>{/if}
                </div>
            {/if}
            <div class="footer-actions">
                <Button
                    id="settings-reset"
                    variant="ghost"
                    size="sm"
                    class="max-w-full"
                    {disabled}
                    onclick={() => editor.reset()}
                    ><RotateCcw class="size-4" aria-hidden="true" /><span
                        class="min-w-0 wrap-anywhere"
                        >{msgs.settings_reset_advanced()}</span
                    ></Button
                >
                <div class="footer-commit-actions">
                    <span
                        class="footer-status text-muted-foreground text-xs"
                        role="status"
                        data-settings-status
                    >
                        {editor.busy
                            ? editor.phase === "downloading"
                                ? msgs.settings_downloading()
                                : editor.phase === "loading"
                                  ? msgs.settings_loading_model()
                                  : msgs.settings_applying()
                            : editor.dirty
                              ? msgs.settings_pending()
                              : msgs.settings_saved()}
                    </span>
                    <Button
                        id="settings-discard"
                        variant="ghost"
                        size="sm"
                        disabled={disabled || !editor.dirty}
                        onclick={() => editor.discard()}
                        >{msgs.settings_discard()}</Button
                    >
                    <Button
                        id="settings-apply"
                        variant="secondary"
                        size="sm"
                        disabled={disabled ||
                            !editor.dirty ||
                            editor.requires_stop}
                        aria-busy={editor.busy}
                        aria-describedby={editor.requires_stop
                            ? "settings-stop-notice"
                            : undefined}
                        onclick={apply}
                    >
                        {#if editor.busy}<LoaderCircle
                                class="size-4 animate-spin motion-reduce:animate-none"
                            />{/if}
                        {msgs.settings_apply()}
                    </Button>
                </div>
            </div>
        </div>
    </footer>
    <Sheet.Root bind:open={report_open}>
        <Sheet.Content class="w-full sm:max-w-xl"
            ><ReportWizard
                onclose={() => (report_open = false)}
            /></Sheet.Content
        >
    </Sheet.Root>
</div>

<style>
    .settings-footer {
        container: footer / inline-size;
    }
    .footer-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        padding: 0 1rem;
    }
    .footer-commit-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-left: auto;
    }
    @container footer (max-width: 32rem) {
        .footer-actions {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
        }
        .footer-commit-actions {
            display: contents;
        }
        .footer-status {
            grid-row: 1;
        }
        .footer-actions :global(button) {
            width: 100%;
            min-width: 0;
        }
    }
</style>
