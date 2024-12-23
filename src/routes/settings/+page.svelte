<script lang="ts">
    import { listen } from "@tauri-apps/api/event";
    import { Checkbox } from "$lib/components/ui/checkbox/index.ts";
    import { Label } from "$lib/components/ui/label/index.ts";
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import { Switch } from "$lib/components/ui/switch/index.ts";
    import * as Select from "$lib/components/ui/select/index.ts";

    type Config = {
        suppress_blanks: boolean;
        print_special: boolean;
        print_progress: boolean;
        token_timestamps: boolean;
        single_segment: boolean;
        split_on_word: boolean;
        tdrz_enable: boolean;
        translate: boolean;
        language: string;
    };

    type Batch = {
        segments: WhisperSegment[];
    };

    type WhisperSegment = {
        _index: number;
        start_time: number;
        end_time: number;
        text: string;
    };

    const languages = ["en", "ru"];

    let batches = $state([] as Batch[]);

    let language = $state("");
    let toggles = $state({
        translate: {
            label: "Translate",
            description: "Translate the recorded audio to english",
            value: false,
        },
        suppress_blanks: {
            label: "Suppress Blanks",
            description:
                "By disabling this, blank [BLNK] special tokens will be included in the output",
            value: true,
        },
        print_special: {
            label: "Print Special",
            description:
                "Enable the internal whisper special tokens in the output",
            value: false,
        },
        print_progress: {
            label: "Print Progress",
            description:
                "Hook into the progress callbacks for the whisper model",
            value: false,
        },
        token_timestamps: {
            label: "Token Timestamps",
            description:
                "Timestamp the tokens coming out of the whisper model. Disabling this will result in some errors in the output such as duplications.",
            value: true,
        },
        single_segment: {
            label: "Single Segment",
            description:
                "Reduces the output of each transcript iteration to a single text segment",
            value: false,
        },
        split_on_word: {
            label: "Split on word",
            description:
                "An internal whisper setting for splitting new tokens based on words",
            value: true,
        },
        tdrz_enable: {
            label: "TDRZ",
            description:
                "Enable diarization which identifies the different speakers in the audio (currently unstable)",
            value: false,
        },
    });

    $effect(() => {
        let config: Config = {
            suppress_blanks: toggles.suppress_blanks.value,
            print_special: toggles.print_special.value,
            print_progress: toggles.print_progress.value,
            token_timestamps: toggles.token_timestamps.value,
            single_segment: toggles.single_segment.value,
            split_on_word: toggles.split_on_word.value,
            tdrz_enable: toggles.tdrz_enable.value,
            translate: toggles.translate.value,
            language: language,
        };
        console.log(config);
    });

    let subscribe = async () => {
        const unlisten = await listen<Batch>("new_batch", (event) => {
            // event.event is the event name (useful if you want to use a single callback fn for multiple event types)
            // event.payload is the payload object
            batches.push(event.payload);
            if (batches.length > 15) {
                batches.shift();
            }
        });
    };

    subscribe();
</script>

<div class="container space-y-4 pb-4">
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
            <Select.Root type="single" bind:value={language} name="language">
                <Select.Trigger>
                    {language ? language : "auto"}
                </Select.Trigger>
                <Select.Content>
                    <Select.Item value="auto" label="auto" />
                    <Select.Item value="en" label="en" />
                    <Select.Item value="ru" label="ru" />
                </Select.Content>
            </Select.Root>
        </div>
        {#each Object.entries(toggles) as [name, setting]}
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
