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
        console.log("subbing");
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
</script>

<div class="mx-auto flex h-screen max-w-screen-lg flex-col container">
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
