<script lang="ts">
    import { Label } from "$lib/components/ui/label/index.ts";
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import { Input } from "$lib/components/ui/input/index.ts";
    import { Button } from "$lib/components/ui/button/index.ts";
    import { Switch } from "$lib/components/ui/switch/index.ts";
    import * as Select from "$lib/components/ui/select/index.ts";
    import { load, Store } from "@tauri-apps/plugin-store";
    import { invoke } from "@tauri-apps/api/core";
    import AudioDevice from "$lib/components/audio-device.svelte";
    import RecordingFormats from "$lib/components/recording-formats.svelte";
    import { open } from "@tauri-apps/plugin-dialog";
    import { onMount } from "svelte";

    type ConfigToggle = {
        label: string;
        description: string;
        key: string;
        value: boolean;
    };

    class Config {
        audio_device = $state("default");
        audio_format = $state("default");
        language = $state("auto");
        model_path = $state("");
        audio_buffer_size = $state(0);
        #store!: Store;
        toggles: { [key: string]: ConfigToggle } = $state({
            translate: {
                label: "Translate",
                description: "Translate the recorded audio to english",
                key: "translate",
                value: false,
            },
            suppress_blanks: {
                label: "Suppress Blanks",
                description:
                    "By disabling this, blank [BLNK] special tokens will be included in the output",
                key: "suppress_blanks",
                value: false,
            },
            print_special: {
                label: "Print Special",
                description:
                    "Enable the internal whisper special tokens in the output",
                key: "print_special",
                value: false,
            },
            print_progress: {
                label: "Print Progress",
                description:
                    "Hook into the progress callbacks for the whisper model",
                key: "print_progress",
                value: false,
            },
            token_timestamps: {
                label: "Token Timestamps",
                description:
                    "Timestamp the tokens coming out of the whisper model. Disabling this will result in some errors in the output such as duplications.",
                key: "token_timestamps",
                value: false,
            },
            single_segment: {
                label: "Single Segment",
                description:
                    "Reduces the output of each transcript iteration to a single text segment",
                key: "single_segment",
                value: false,
            },
            split_on_word: {
                label: "Split on word",
                description:
                    "An internal whisper setting for splitting new tokens based on words",
                key: "split_on_word",
                value: false,
            },
            tdrz_enable: {
                label: "TDRZ",
                description:
                    "Enable diarization which identifies the different speakers in the audio (currently unstable)",
                key: "tdrz_enable",
                value: false,
            },
        });

        async init() {
            this.#store = await load("config.json", { autoSave: true });

            this.model_path = await this.get_store_value(
                "model_path",
                this.model_path,
            );
            this.language = await this.get_store_value(
                "language",
                this.language,
            );
            this.audio_buffer_size = await this.get_store_value(
                "audio_buffer_size",
                this.audio_buffer_size,
            );
            for (const [key, value] of Object.entries(this.toggles)) {
                this.toggles[key].value = await this.get_store_value(
                    key,
                    value.value,
                );
            }
            $effect.root(() => {
                $effect(() => {
                    console.log("DEBUG: config changed, syncing...");
                    this.#store.set("language", { value: this.language });
                    this.#store.set("model_path", { value: this.model_path });
                    this.#store.set("audio_buffer_size", {
                        value: this.audio_buffer_size,
                    });
                    for (const [name, toggle] of Object.entries(this.toggles)) {
                        this.#store.set(toggle.key, { value: toggle.value });
                    }

                    invoke("set_params", {
                        translate: this.toggles.translate.value,
                        suppress_blanks: this.toggles.suppress_blanks.value,
                        print_special: this.toggles.print_special.value,
                        print_progress: this.toggles.print_progress.value,
                        token_timestamps: this.toggles.token_timestamps.value,
                        single_segment: this.toggles.single_segment.value,
                        split_on_word: this.toggles.split_on_word.value,
                        tdrz_enable: this.toggles.tdrz_enable.value,
                        language: this.language,
                    });
                });
            });
        }

        async get_store_value<T>(key: string, default_val: T): Promise<T> {
            return (
                (await this.#store.get<{ value: T }>(key))?.value || default_val
            );
        }
    }

    const select_file = async (event: { preventDefault: () => void }) => {
        event.preventDefault();
        console.log("selecting file");
        const selected = await open({
            directory: false,
            multiple: false,
            filters: [{ name: "Model File", extensions: ["bin"] }],
        });
        if (Array.isArray(selected) || selected === null) {
            // user selected multiple directories
            console.log("error");
        } else {
            // user selected a single file
            console.log(selected);
            cfg.model_path = selected;
        }
    };

    let cfg = new Config();

    $inspect(cfg.model_path);

    onMount(() => {
        cfg.init();
    });
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
        <AudioDevice />
        <RecordingFormats />
        <div class="max-w-72 space-y-2 pb-4">
            <Label
                id="audio_buffer_size-label"
                for="audio_buffer_size"
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
                Audio Buffer Size
            </Label>
            <Input
                type="number"
                id="audio_buffer_size"
                class="max-w-24"
                bind:value={cfg.audio_buffer_size}
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
                    bind:value={cfg.model_path}
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
                bind:value={cfg.language}
                name="language"
            >
                <Select.Trigger>
                    {cfg.language ? cfg.language : "auto"}
                </Select.Trigger>
                <Select.Content>
                    <Select.Item value="auto" label="auto" />
                    <Select.Item value="en" label="en" />
                    <Select.Item value="ru" label="ru" />
                </Select.Content>
            </Select.Root>
        </div>
        {#each Object.entries(cfg.toggles) as [name, setting]}
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
                        bind:checked={setting.value}
                        aria-labelledby="{name}-label"
                    />
                </div>
            </div>
        {/each}
    </div>
</div>
