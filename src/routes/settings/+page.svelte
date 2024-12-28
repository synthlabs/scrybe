<script lang="ts">
    import { Label } from "$lib/components/ui/label/index.ts";
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import { Switch } from "$lib/components/ui/switch/index.ts";
    import * as Select from "$lib/components/ui/select/index.ts";
    import { load, Store } from "@tauri-apps/plugin-store";
    import { invoke } from "@tauri-apps/api/core";
    import AudioDevice from "$lib/components/audio-device.svelte";
    import RecordingFormats from "$lib/components/recording-formats.svelte";

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
                key: "tdrz",
                value: false,
            },
        });

        async init() {
            this.#store = await load("config.json", { autoSave: true });

            this.language = await this.get_store_value(
                "language",
                this.language,
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

    let cfg = new Config();
    cfg.init();
</script>

<div class="container space-y-4 pb-4">
    <div>
        <h3 class="text-lg font-medium" id="audio">Audio</h3>
        <p class="text-muted-foreground text-sm">
            Set the audio device and audio recording properties for Scrybe.
        </p>
    </div>
    <Separator />
    <div class="space-y-4">
        <AudioDevice />
        <RecordingFormats />
    </div>
    <div>
        <h3 class="text-lg font-medium" id="whisper">Whisper</h3>
        <p class="text-muted-foreground text-sm">
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
                class="space-y-2 flex flex-row items-center justify-between rounded-lg border p-4 max-w-lg"
            >
                <div>
                    <Label
                        id="{name}-label"
                        for={name}
                        class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        {setting.label}
                    </Label>
                    <div class="text-muted-foreground text-sm">
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
