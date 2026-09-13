<script lang="ts">
    import { onMount } from "svelte";
    import type {
        AppState,
        OverlayConfig,
        OverlayTestState,
        WebsocketRequest,
        WebsocketResponse,
        WhisperSegment,
    } from "$lib/bindings";
    import TextOverlay from "$lib/components/overlay/text-overlay.svelte";
    import CaptionSample from "$lib/components/overlay/caption-sample.svelte";
    import { DefaultAppState } from "$lib/defaults";
    import { canvasViewportTransform } from "$lib/overlay/layout-math.js";
    import { placementStyle } from "$lib/overlay/placement.js";

    let config: OverlayConfig = $state(DefaultAppState.overlay_config);
    const emptyTest = (): OverlayTestState => ({
        id: "",
        config: null,
        text: "",
        started_at_ms: 0,
        expires_at_ms: 0,
        revision: 0,
    });
    let test = $state<OverlayTestState>(emptyTest());
    let segment: WhisperSegment = $state({ id: "", index: 0, items: [] });
    let viewport = $state({ width: 1, height: 1 });
    let now = $state(Date.now());
    const testing = $derived(
        test !== null && test.config !== null && test.expires_at_ms > now,
    );
    const displayed = $derived(testing && test?.config ? test.config : config);
    const transform = $derived(
        canvasViewportTransform(displayed.canvas, viewport),
    );
    const clear = () => {
        segment = { id: "", index: 0, items: [] };
        test = emptyTest();
    };

    onMount(() => {
        const classes = [
            "m-0",
            "h-full",
            "w-full",
            "overflow-hidden",
            "!bg-transparent",
        ];
        document.body.classList.add(...classes);
        document.documentElement.classList.add("!bg-transparent");
        const measure = () =>
            (viewport = { width: innerWidth, height: innerHeight });
        measure();
        window.addEventListener("resize", measure);
        const timer = setInterval(() => (now = Date.now()), 100);
        const ws = new WebSocket("ws://localhost:3030/ws");
        ws.onmessage = (event) => {
            const response: WebsocketResponse = JSON.parse(event.data);
            switch (response.kind) {
                case "session_reset":
                    segment = { id: "", index: 0, items: [] };
                    break;
                case "segment_update":
                    segment = JSON.parse(response.data);
                    break;
                case "app_state_update": {
                    const state: AppState = JSON.parse(response.data);
                    config = state.overlay_config;
                    break;
                }
                case "overlay_test_update": {
                    const state: OverlayTestState = JSON.parse(response.data);
                    if (
                        state.started_at_ms < test.started_at_ms ||
                        (state.started_at_ms === test.started_at_ms &&
                            state.revision < test.revision)
                    )
                        break;
                    test = state;
                    break;
                }
            }
        };
        ws.onopen = () => {
            const app_request: WebsocketRequest = {
                kind: "get_appstate",
                data: "{}",
            };
            const test_request: WebsocketRequest = {
                kind: "get_overlay_test",
                data: "{}",
            };
            ws.send(JSON.stringify(app_request));
            ws.send(JSON.stringify(test_request));
        };
        ws.onclose = clear;
        ws.onerror = clear;
        return () => {
            ws.close();
            clearInterval(timer);
            window.removeEventListener("resize", measure);
            document.body.classList.remove(...classes);
            document.documentElement.classList.remove("!bg-transparent");
        };
    });
</script>

<div class="fixed inset-0 overflow-hidden bg-transparent">
    <div
        class="absolute origin-top-left"
        style:left={transform.x + "px"}
        style:top={transform.y + "px"}
        style:width={displayed.canvas.width + "px"}
        style:height={displayed.canvas.height + "px"}
        style:transform={`scale(${transform.scale})`}
    >
        <div class="absolute" style={placementStyle(displayed.layout)}>
            {#if testing && test}
                <CaptionSample
                    text={test.text}
                    style={displayed.style}
                    max_width={displayed.layout.max_width}
                    started_at_ms={test.started_at_ms}
                />
            {:else}
                <TextOverlay
                    style={displayed.style}
                    max_width={displayed.layout.max_width}
                    current_segment={segment}
                />
            {/if}
        </div>
    </div>
</div>
