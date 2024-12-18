<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";

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
  let suppress_blanks = $state(true);
  let print_special = $state(true);
  let print_progress = $state(true);
  let token_timestamps = $state(true);
  let single_segment = $state(true);
  let split_on_word = $state(true);
  let tdrz_enable = $state(true);
  let translate = $state(true);
  let language = $state("");

  $effect(() => {
    let config: Config = {
      suppress_blanks,
      print_special,
      print_progress,
      token_timestamps,
      single_segment,
      split_on_word,
      tdrz_enable,
      translate,
      language,
    };
    console.log(config);
  });

  let subscribe = async () => {
    const unlisten = await listen<Batch>("new_batch", (event) => {
      // event.event is the event name (useful if you want to use a single callback fn for multiple event types)
      // event.payload is the payload object
      batches.push(event.payload);
      if (batches.length > 5) {
        batches.shift();
      }
    });
  };

  subscribe();
</script>

<div class="mx-auto flex h-screen max-w-screen-lg flex-col container">
  <div class="p-2 flex flex-row flex-wrap">
    <div class="p-2">
      <input type="checkbox" bind:checked={suppress_blanks} />
      suppress blanks
    </div>
    <div class="p-2">
      <input type="checkbox" bind:checked={print_special} />
      print special
    </div>
    <div class="p-2">
      <input type="checkbox" bind:checked={print_progress} />
      print progress
    </div>
    <div class="p-2">
      <input type="checkbox" bind:checked={token_timestamps} />
      token timestamps
    </div>
    <div class="p-2">
      <input type="checkbox" bind:checked={single_segment} />
      single segment
    </div>
    <div class="p-2">
      <input type="checkbox" bind:checked={split_on_word} />
      split on word
    </div>
    <div class="p-2">
      <input type="checkbox" bind:checked={tdrz_enable} />
      tdrz enable
    </div>
    <div class="p-2">
      <input type="checkbox" bind:checked={translate} />
      translate
    </div>
  </div>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 space-y-1 overflow-y-hidden p-2">
      {#each batches as batch}
        <div class="divider p-2"></div>
        {#each batch.segments as segment (segment._index)}
          <div class="w-full text-wrap text-gray-800">
            {segment.start_time}
            {segment.text}
          </div>
        {/each}
      {/each}
    </div>
  </div>
</div>
