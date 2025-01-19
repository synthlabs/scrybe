<script lang="ts">
    import type { WhisperSegment } from "$bindings/WhisperSegment";
    import TextOverlay from "$lib/components/overlay/text-overlay.svelte";

    let current_segment: WhisperSegment = $state({
        id: "",
        index: 0,
        items: [],
    });

    const ws = new WebSocket("ws://localhost:3030/ws");
    ws.onmessage = (event) => {
        let segment: WhisperSegment = JSON.parse(event.data);
        current_segment = segment;
    };
    ws.onopen = (event) => {
        console.log("connected", event);
        ws.send(`Hello, WebSocket! Sent from a browser client.`);
    };
</script>

<div class="h-full w-full">
    <TextOverlay {current_segment} />
</div>

<style>
    :global(body) {
        height: 100%;
        width: 100%;
    }
</style>
