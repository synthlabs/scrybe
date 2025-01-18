<script lang="ts">
    import TextOverlay from "$lib/components/overlay/text-overlay.svelte";

    const ws = new WebSocket("ws://localhost:3030/ws");
    ws.onmessage = (event) => {
        console.log(event);
    };
    ws.onopen = (event) => {
        console.log("connected", event);
        ws.send(`Hello, WebSocket! Sent from a browser client.`);
    };
</script>

<TextOverlay />
