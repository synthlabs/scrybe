<script lang="ts">
    import type {
        WhisperSegment,
        WebsocketRequest,
        WebsocketResponse,
        OverlayConfig,
        AppState,
    } from "$lib/bindings";
    import TextOverlay from "$lib/components/overlay/text-overlay.svelte";
    import { DefaultAppState } from "$lib/defaults";

    let current_segment: WhisperSegment = $state({
        id: "",
        index: 0,
        items: [],
    });

    let overlay_config: OverlayConfig = $state(DefaultAppState.overlay_config);

    $inspect(overlay_config);

    const ws = new WebSocket("ws://localhost:3030/ws");
    ws.onmessage = (ws_event) => {
        let event: WebsocketResponse = JSON.parse(ws_event.data);
        console.log(event);

        switch (event.kind) {
            case "segment_update":
                const segment: WhisperSegment = JSON.parse(event.data);
                current_segment = segment;
                break;
            case "appstate_update":
                const appstate: AppState = JSON.parse(event.data);
                overlay_config = appstate.overlay_config;
                break;
            default:
                console.log("unknown event type");
                break;
        }
        // current_segment = segment;
    };
    ws.onopen = (event) => {
        console.log("connected", event);
        const request: WebsocketRequest = {
            kind: "get_appstate",
            data: "{}",
        };
        ws.send(JSON.stringify(request));
    };
</script>

<TextOverlay
    justify={overlay_config.text_alignment}
    background={overlay_config.background_color}
    transparency={overlay_config.transparency}
    {current_segment}
/>

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
