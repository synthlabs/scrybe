<script lang="ts">
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import { onDestroy, onMount } from "svelte";

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

    let un_sub: UnlistenFn;

    onMount(async () => {
        console.log("subbing to transcript");
        un_sub = await listen<Batch>("new_batch", (event) => {
            // event.event is the event name (useful if you want to use a single callback fn for multiple event types)
            // event.payload is the payload object
            batches.unshift(event.payload);

            if (batches.length > 15) {
                batches.pop();
            }
        });
    });

    onDestroy(() => {
        console.log("unsubbing");
        un_sub();
    });
</script>

<div class="pb-6">
    {#each batches as batch}
        {#each batch.segments as segment (segment._index)}
            <div class="w-full text-wrap">
                {segment.start_time}
                {segment.text}
            </div>
        {/each}
        <Separator class="my-2" />
    {/each}
</div>
