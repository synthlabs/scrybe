<script lang="ts">
    import { Label } from "$lib/components/ui/label/index.ts";
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import { Input } from "$lib/components/ui/input/index.ts";
    import { Button } from "$lib/components/ui/button/index.ts";
    import { Switch } from "$lib/components/ui/switch/index.ts";
    import * as Select from "$lib/components/ui/select/index.ts";
    import AudioDevice from "$lib/components/audio-device.svelte";
    import RecordingFormats from "$lib/components/recording-formats.svelte";
    import { open } from "@tauri-apps/plugin-dialog";
    import { onDestroy } from "svelte";
    import { SyncedState } from "tauri-svelte-synced-store";
    import { DefaultAppState, DefaultInternalState } from "$lib/defaults";
    import { type UnlistenFn } from "@tauri-apps/api/event";
    import type {
        AppState,
        InternalState,
        WhisperToggles,
    } from "$lib/bindings";
    import Logger from "$utils/log";

    let app_state = new SyncedState<AppState>("app_state", DefaultAppState);
    let internal_state = new SyncedState<InternalState>(
        "internal_state",
        DefaultInternalState,
    );

    $inspect(app_state.obj);
    $inspect(internal_state.obj);

    let un_sub: UnlistenFn;

    onDestroy(() => {
        Logger.debug("unsubbing - settings page");
    });

    type ConfigToggle = {
        label: string;
        description: string;
        key: string;
    };

    type IndexedToggle = WhisperToggles & {
        [key: string]: any; // Index signature
    };

    let store_toggles = $derived(
        app_state.obj.whisper_params.toggles as IndexedToggle,
    );

    let toggle_metadata: { [key: string]: ConfigToggle } = {
        translate: {
            label: "Translate",
            description: "Translate the recorded audio to english",
            key: "translate",
        },
        suppress_blanks: {
            label: "Suppress Blanks",
            description:
                "By disabling this, blank [BLNK] special tokens will be included in the output",
            key: "suppress_blanks",
        },
        print_special: {
            label: "Print Special",
            description:
                "Enable the internal whisper special tokens in the output",
            key: "print_special",
        },
        print_progress: {
            label: "Print Progress",
            description:
                "Hook into the progress callbacks for the whisper model",
            key: "print_progress",
        },
        token_timestamps: {
            label: "Token Timestamps",
            description:
                "Timestamp the tokens coming out of the whisper model. Disabling this will result in some errors in the output such as duplications.",
            key: "token_timestamps",
        },
        single_segment: {
            label: "Single Segment",
            description:
                "Reduces the output of each transcript iteration to a single text segment",
            key: "single_segment",
        },
        split_on_word: {
            label: "Split on word",
            description:
                "An internal whisper setting for splitting new tokens based on words",
            key: "split_on_word",
        },
        tdrz_enable: {
            label: "TDRZ",
            description:
                "Enable diarization which identifies the different speakers in the audio (currently unstable)",
            key: "tdrz_enable",
        },
    };

    const select_file = async (event: { preventDefault: () => void }) => {
        event.preventDefault();
        Logger.debug("selecting file");
        const selected = await open({
            directory: false,
            multiple: false,
            filters: [{ name: "Model File", extensions: ["bin"] }],
        });
        if (Array.isArray(selected) || selected === null) {
            // user selected multiple directories
            Logger.error("selected multiple directories");
        } else {
            // user selected a single file
            Logger.debug(selected);
            app_state.obj.model_path = selected;
        }
        app_state.sync();
    };
</script>

<div class="mx-auto w-full max-w-2xl space-y-4 pb-4">
    <div>
        <h3 class="scroll-mt-20 text-lg font-medium" id="audio">Audio</h3>
        <p class="text-sm text-muted-foreground">
            Set the audio device and audio recording properties for Scrybe.
        </p>
    </div>
    <Separator />
    <div class="space-y-4">
        <AudioDevice {app_state} {internal_state} />
        <div class="max-w-72 space-y-2 pb-4">
            <Label
                id="audio_segment_size-label"
                for="audio_segment_size"
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
                Audio Segment Size (seconds)
            </Label>
            <Input
                type="number"
                id="audio_segment_size"
                class="max-w-24"
                bind:value={app_state.obj.audio_segment_size}
            />
        </div>
    </div>
    <div>
        <h3 class="scroll-mt-20 text-lg font-medium" id="model">Model</h3>
        <p class="text-sm text-muted-foreground">
            Configure advanced properties for the model being used.
        </p>
    </div>
    <Separator />
    <div class="space-y-4 pb-4">
        <div class="flex w-full max-w-lg flex-col gap-y-2">
            <Label for="model-input" class="">Location</Label>
            <div class="flex flex-row gap-2">
                <Button type="button" onclick={select_file}>Choose File</Button>
                <Input
                    type="text"
                    id="model-input"
                    placeholder="Model Path"
                    class=""
                    bind:value={app_state.obj.model_path}
                    disabled
                />
            </div>
            <p class="text-sm text-muted-foreground">
                Enter the full path to the model file to use
            </p>
        </div>
    </div>
    <div>
        <h3 class="scroll-mt-20 text-lg font-medium" id="whisper">Whisper</h3>
        <p class="text-sm text-muted-foreground">
            Configure different parameters for the Whisper model.
        </p>
    </div>
    <Separator />
    <div class="space-y-4">
        <div class="max-w-48 space-y-2 pb-4">
            <Label
                id="language-label"
                for="language"
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
                Language
            </Label>
            <Select.Root
                type="single"
                bind:value={app_state.obj.whisper_params.language}
                name="language"
            >
                <Select.Trigger>
                    {app_state.obj.whisper_params.language
                        ? app_state.obj.whisper_params.language
                        : "auto"}
                </Select.Trigger>
                <Select.Content>
                    <Select.Item value="auto" label="auto" />
                    <Select.Item value="en" label="en" />
                    <Select.Item value="ru" label="ru" />
                </Select.Content>
            </Select.Root>
        </div>
        {#each Object.entries(toggle_metadata) as [name, setting]}
            <div
                class="flex max-w-lg flex-row items-center justify-between space-y-2 rounded-lg border p-4"
            >
                <div>
                    <Label
                        id="{name}-label"
                        for={name}
                        class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        {setting.label}
                    </Label>
                    <div class="text-sm text-muted-foreground">
                        {setting.description}
                    </div>
                </div>
                <div class="px-2">
                    <Switch
                        id={name}
                        bind:checked={store_toggles[setting.key]}
                        aria-labelledby="{name}-label"
                    />
                </div>
            </div>
        {/each}
    </div>
</div>
