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

<TextOverlay {current_segment} />

<style>
    :global(html) {
        background-color: transparent !important;
    }
    :global(body) {
        height: 100%;
        width: 100%;
        background-color: transparent !important;
    }
</style>
