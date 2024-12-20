<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";

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

  let batches = $state([] as Batch[]);

  let print_special = $state(true);
  let print_progress = $state(true);
  let token_timestamps = $state(true);
  let single_segment = $state(true);
  let split_on_word = $state(true);
  let tdrz_enable = $state(true);
  let translate = $state(true);
  let language = $state("");
  let settings = $state({
    suppress_blanks: {
      label: "Suppress Blanks",
      value: true,
    },
    print_special: {
      label: "Print Special",
      value: true,
    },
    print_progress: {
      label: "Print Progress",
      value: true,
    },
    token_timestamps: {
      label: "Token Timestamps",
      value: true,
    },
    single_segment: {
      label: "Single Segment",
      value: true,
    },
    split_on_word: {
      label: "Split on word",
      value: true,
    },
    tdrz_enable: {
      label: "TDRZ",
      value: true,
    },
    translate: {
      label: "Translate",
      value: true,
    },
  });

  $effect(() => {
    let config: Config = {
      suppress_blanks: settings.suppress_blanks.value,
      print_special: settings.print_special.value,
      print_progress: settings.print_progress.value,
      token_timestamps: settings.token_timestamps.value,
      single_segment: settings.single_segment.value,
      split_on_word: settings.split_on_word.value,
      tdrz_enable: settings.tdrz_enable.value,
      translate: settings.translate.value,
      language,
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

<div class="mx-auto flex h-screen max-w-screen-lg flex-col container">
  <div class="p-2 flex flex-row flex-wrap gap-4">
    {#each Object.entries(settings) as [name, setting]}
      <div class="flex items-center space-x-2">
        <Checkbox
          id={name}
          bind:checked={setting.value}
          aria-labelledby="{name}-label"
        />
        <Label
          id="{name}-label"
          for={name}
          class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {setting.label}
        </Label>
      </div>
    {/each}
  </div>
  <Separator />
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 space-y-1 overflow-y-hidden p-2">
      {#each batches as batch}
        <div class="divider p-2"></div>
        {#each batch.segments as segment (segment._index)}
          <div class="w-full text-wrap">
            {segment.start_time}
            {segment.text}
          </div>
        {/each}
      {/each}
    </div>
  </div>
</div>
