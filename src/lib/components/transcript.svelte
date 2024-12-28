<script lang="ts">
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import { onDestroy } from "svelte";

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

    let subscribe = async () => {
        console.log("subbing to transcript");
        un_sub = await listen<Batch>("new_batch", (event) => {
            // event.event is the event name (useful if you want to use a single callback fn for multiple event types)
            // event.payload is the payload object
            batches.push(event.payload);
            if (batches.length > 15) {
                batches.shift();
            }
        });
    };

    subscribe();

    onDestroy(() => {
        console.log("unsubbing");
        un_sub();
    });

    const subtitles = Array.from({ length: 50 }).map(
        (_, i, a) => `subtitle ${a.length - i}`,
    );
</script>

<div class="pb-6">
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
