<script lang="ts">
    import type {
        AppState,
        InternalState,
        OverlayConfig,
        WebsocketRequest,
        WebsocketResponse,
        WhisperSegment,
    } from "$lib/bindings";
    import TextOverlay from "$lib/components/overlay/text-overlay.svelte";
    import { DefaultAppState, DefaultInternalState } from "$lib/defaults";
    import { canvasViewportTransform } from "$lib/overlay/layout-math.js";
    import { onMount } from "svelte";

    const emptySegment = (): WhisperSegment => ({
        id: "",
        index: 0,
        items: [],
    });

    let current_segment: WhisperSegment = $state({
        id: "",
        index: 0,
        items: [],
    });

    let overlay_config: OverlayConfig = $state(DefaultAppState.overlay_config);
    let overlay_test = $state(DefaultInternalState.overlay_test);
    let viewport = $state({
        width: 1,
        height: 1,
    });
    let now = $state(Date.now());

    let box_style = $derived(
        [
            `left: ${overlay_config.box.x}px`,
            `top: ${overlay_config.box.y}px`,
            `width: ${overlay_config.box.w}px`,
            `height: ${overlay_config.box.h}px`,
        ].join("; "),
    );
    let viewport_transform = $derived(
        canvasViewportTransform(overlay_config.canvas, viewport),
    );
    let canvas_style = $derived(
        [
            `left: ${viewport_transform.x}px`,
            `top: ${viewport_transform.y}px`,
            `width: ${overlay_config.canvas.width}px`,
            `height: ${overlay_config.canvas.height}px`,
            `transform: scale(${viewport_transform.scale})`,
            "transform-origin: top left",
        ].join("; "),
    );
    let overlay_test_visible = $derived(
        overlay_test.visible &&
            (!overlay_test.expires_at_ms || overlay_test.expires_at_ms > now),
    );
    let rendered_segment = $derived(
        overlay_test_visible ? emptySegment() : current_segment,
    );

    onMount(() => {
        const measure = () => {
            viewport = {
                width: window.innerWidth,
                height: window.innerHeight,
            };
        };

        measure();
        window.addEventListener("resize", measure);
        const timer = setInterval(() => (now = Date.now()), 1000);

        return () => {
            window.removeEventListener("resize", measure);
            clearInterval(timer);
        };
    });

    const clearOverlay = () => {
        current_segment = emptySegment();
        overlay_test = {
            visible: false,
            text: "",
            expires_at_ms: null,
        };
    };

    const ws = new WebSocket("ws://localhost:3030/ws");
    ws.onmessage = (ws_event) => {
        let event: WebsocketResponse = JSON.parse(ws_event.data);

        switch (event.kind) {
            case "segment_update":
                current_segment = JSON.parse(event.data);
                break;
            case "app_state_update":
                const appstate: AppState = JSON.parse(event.data);
                overlay_config = appstate.overlay_config;
                break;
            case "internal_state_update":
                const internal_state: InternalState = JSON.parse(event.data);
                overlay_test = internal_state.overlay_test;
                break;
            default:
                console.warn("unknown websocket event type", event.kind);
                break;
        }
    };
    ws.onopen = () => {
        const request: WebsocketRequest = {
            kind: "get_appstate",
            data: "{}",
        };
        ws.send(JSON.stringify(request));
        const internal_state_request: WebsocketRequest = {
            kind: "get_internalstate",
            data: "{}",
        };
        ws.send(JSON.stringify(internal_state_request));
    };
    ws.onclose = clearOverlay;
    ws.onerror = clearOverlay;
</script>

<div class="fixed inset-0 overflow-hidden bg-transparent">
        <div class="absolute" style={canvas_style}>
        <div class="overlay-box absolute" style={box_style}>
            <TextOverlay
                style={overlay_config.style}
                test_mode={overlay_test_visible}
                test_text={overlay_test.text}
                current_segment={rendered_segment}
            />
        </div>
    </div>
</div>

<style>
    :global(html) {
        background-color: transparent !important;
    }
    :global(body) {
        height: 100%;
        width: 100%;
        margin: 0;
        overflow: hidden;
        background-color: transparent !important;
    }

    .overlay-box {
        transition:
            left 100ms linear,
            top 100ms linear,
            width 100ms linear,
            height 100ms linear;
        will-change: left, top, width, height;
    }
</style>
