<script lang="ts">
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import { onDestroy, onMount } from "svelte";
    import type { WhisperSegment } from "$bindings/WhisperSegment";

    let current_segment: WhisperSegment = $state({} as WhisperSegment);

    let un_sub: UnlistenFn;

    onMount(async () => {
        console.log("subbing to transcript");
        un_sub = await listen<WhisperSegment>("segment_update", (event) => {
            // event.event is the event name (useful if you want to use a single callback fn for multiple event types)
            // event.payload is the payload object
            // batches.unshift(event.payload);

            // if (batches.length > 15) {
            //     batches.pop();
            // }

            console.log(event.payload);
            current_segment = event.payload;
        });
    });

    onDestroy(() => {
        console.log("unsubbing");
        un_sub();
    });
</script>

<div class="pb-6">
    {#each current_segment.items as segment (segment.index)}
        <div class="w-full text-wrap">
            {segment.text}
        </div>
    {/each}
</div>
