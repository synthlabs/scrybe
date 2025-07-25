<script lang="ts">
    import AlignLeft from "lucide-svelte/icons/align-left";
    import AlignCenter from "lucide-svelte/icons/align-center";
    import AlignRight from "lucide-svelte/icons/align-right";
    import TextOverlay from "$lib/components/overlay/text-overlay.svelte";
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import { Label } from "$lib/components/ui/label/index.ts";
    import { Slider } from "$lib/components/ui/slider/index.ts";
    import { cn } from "$lib/utils";
    import { SyncedStore } from "$lib/store.svelte";
    import { DefaultAppState } from "$bindings/defaults";
    import type { AppState } from "$bindings/AppState";
    import type { WhisperSegment } from "$bindings/WhisperSegment";
    import { type UnlistenFn, listen } from "@tauri-apps/api/event";
    import { onMount, onDestroy } from "svelte";

    let store = new SyncedStore<AppState>("appstate", DefaultAppState);
    store.init();

    $inspect(store.object.overlay_config.background_color);
    $inspect(store.object.overlay_config.transparency);

    let un_sub: UnlistenFn;
    let current_segment: WhisperSegment = $state({
        id: "",
        index: 0,
        items: [],
    });

    onMount(async () => {
        console.log("subbing to transcript");
        un_sub = await listen<WhisperSegment>("segment_update", (event) => {
            console.log(event.payload);
            current_segment = event.payload;
        });
    });

    onDestroy(() => {
        console.log("unsubbing");
        un_sub();
    });
</script>

<div class="mx-auto w-full space-y-4 pb-4">
    <div>
        <h3 class="text-lg font-medium" id="audio">Overlay</h3>
        <p class="text-sm text-muted-foreground">
            Manage the look of the subtitles that will be shown on the overlay.
        </p>
    </div>
    <Separator />
    <div class="space-y-4">
        <div class="bg-checkered h-32 w-full border-2 border-primary">
            <TextOverlay
                test_mode={true}
                justify={store.object.overlay_config.text_alignment}
                background={store.object.overlay_config.background_color}
                transparency={store.object.overlay_config.transparency}
                {current_segment}
            ></TextOverlay>
        </div>
        <div class="flex w-full flex-row flex-wrap gap-4">
            <div class="flex flex-col gap-2 pt-4">
                <Label
                    id="align-label"
                    for="align"
                    class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                    Align
                </Label>
                <div id="align" class="row flex flex-row">
                    <button
                        class={cn(
                            "rounded-md rounded-r-none border border-transparent px-4 py-2 text-center text-sm text-white shadow-md transition-all hover:bg-accent hover:shadow-lg focus:bg-slate-600 focus:shadow-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
                            store.object.overlay_config.text_alignment == "left"
                                ? "bg-accent"
                                : "bg-secondary",
                        )}
                        onclick={() =>
                            (store.object.overlay_config.text_alignment =
                                "left")}
                        type="button"
                    >
                        <AlignLeft />
                    </button>
                    <button
                        class={cn(
                            "rounded-none border border-transparent  px-4 py-2 text-center text-sm text-white shadow-md transition-all hover:bg-accent hover:shadow-lg focus:bg-slate-600 focus:shadow-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
                            store.object.overlay_config.text_alignment ==
                                "center"
                                ? "bg-accent"
                                : "bg-secondary",
                        )}
                        onclick={() =>
                            (store.object.overlay_config.text_alignment =
                                "center")}
                        type="button"
                    >
                        <AlignCenter />
                    </button>
                    <button
                        class={cn(
                            "rounded-md rounded-l-none border border-transparent  px-4 py-2 text-center text-sm text-white shadow-md transition-all hover:bg-accent hover:shadow-lg focus:bg-slate-600 focus:shadow-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
                            store.object.overlay_config.text_alignment ==
                                "right"
                                ? "bg-accent"
                                : "bg-secondary",
                        )}
                        onclick={() =>
                            (store.object.overlay_config.text_alignment =
                                "right")}
                        type="button"
                    >
                        <AlignRight />
                    </button>
                </div>
            </div>
            <div class="flex flex-col gap-2 pt-4">
                <Label
                    id="color-label"
                    for="bg-color"
                    class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                    Background Color
                </Label>
                <div id="bg-color" class="flex flex-grow flex-row items-center">
                    <input
                        type="color"
                        bind:value={
                            store.object.overlay_config.background_color
                        }
                    />
                    <Slider
                        type="single"
                        bind:value={store.object.overlay_config.transparency}
                        max={100}
                        step={1}
                        class="w-72 px-2"
                    />
                </div>
            </div>
            <div class="flex flex-col gap-2 pt-4">another setting</div>
            <div class="flex flex-col gap-2 pt-4">another setting</div>
        </div>
    </div>
</div>

<style>
    .bg-checkered {
        background-image: linear-gradient(
                rgba(110, 110, 110, 0.6),
                rgba(110, 110, 110, 0.6)
            ),
            url("data:image/svg+xml,%0A%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23F0F0F0' d='M0 0h16v16H0zm16 16h16v16H16z'/%3E%3C/svg%3E");
        background-size: 32px 32px;
    }
</style>
