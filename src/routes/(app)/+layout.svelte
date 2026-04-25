<script lang="ts">
    import LifeBuoy from "@lucide/svelte/icons/life-buoy";
    import House from "@lucide/svelte/icons/house";
    import Settings2 from "@lucide/svelte/icons/settings-2";
    import Projector from "@lucide/svelte/icons/projector";
    import AppSidebar from "$lib/components/app-sidebar.svelte";
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import * as Sidebar from "$lib/components/ui/sidebar/index.ts";
    import { onMount } from "svelte";
    import { checkForAppUpdates } from "$utils/updater";
    import { m as msgs } from "$lib/paraglide/messages";

    import StatusPill from "$lib/components/header/status-pill.svelte";
    import PlayPauseButton from "$lib/components/header/play-pause-button.svelte";
    import { header } from "$lib/stores/header.svelte";

    let navMain = [
        {
            title: msgs.sidebar_home(),
            url: "/",
            icon: House,
        },
        {
            title: msgs.sidebar_overlay(),
            url: "/overlay",
            icon: Projector,
        },
        {
            title: msgs.sidebar_settings(),
            url: "/settings",
            icon: Settings2,
        },
    ];

    let navSecondary = [
        {
            title: msgs.sidebar_about(),
            url: "/about",
            icon: LifeBuoy,
        },
    ];

    let { children } = $props();

    onMount(async () => {
        await checkForAppUpdates(
            "https://github.com/synthlabs/scrybe/releases/latest",
        );
    });
</script>

<Sidebar.Provider style="--sidebar-width: 200px">
    <AppSidebar {navMain} {navSecondary} />
    <Sidebar.Inset>
        <header
            class="sticky top-0 z-50 flex h-12 shrink-0 items-center gap-2 border-b bg-background pl-2 pr-3"
        >
            <Sidebar.Trigger class="-ml-1" />
            {#if header.title}
                <Separator orientation="vertical" class="mx-1 h-4" />
                <span class="text-sm font-semibold">{header.title}</span>
            {/if}
            {#if header.extras}
                <Separator orientation="vertical" class="mx-1 h-4" />
                {@render header.extras()}
            {/if}
            <div class="flex flex-grow"></div>
            {#if header.extras_right}
                {@render header.extras_right()}
                <Separator orientation="vertical" class="mx-1 h-4" />
            {/if}
            <StatusPill />
            <PlayPauseButton />
        </header>
        <div class="flex min-h-0 flex-grow flex-col">
            {@render children?.()}
        </div>
    </Sidebar.Inset>
</Sidebar.Provider>
