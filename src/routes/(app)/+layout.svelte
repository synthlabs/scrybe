<script lang="ts">
    import LifeBuoy from "lucide-svelte/icons/life-buoy";
    import House from "lucide-svelte/icons/house";
    import Settings2 from "lucide-svelte/icons/settings-2";
    import Projector from "lucide-svelte/icons/projector";
    import { page } from "$app/state";
    import AppSidebar from "$lib/components/app-sidebar.svelte";
    import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.ts";
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import * as Sidebar from "$lib/components/ui/sidebar/index.ts";
    import { onMount } from "svelte";
    import { checkForAppUpdates } from "$utils/updater";

    import TranscriptControls from "$lib/components/transcript-controls.svelte";

    let user = {
        name: "shadcn",
        email: "m@example.com",
        avatar: "/avatars/shadcn.jpg",
    };

    let navMain = [
        {
            title: "Home",
            url: "/",
            icon: House,
        },
        // {
        //     title: "Models",
        //     url: "/models",
        //     icon: Bot,
        // },
        {
            title: "Overlay",
            url: "/overlay",
            icon: Projector,
        },
        {
            title: "Settings",
            url: "/settings",
            icon: Settings2,
            items: [
                {
                    title: "Audio",
                    url: "/settings#audio",
                },
                {
                    title: "Model",
                    url: "/settings#model",
                },
                {
                    title: "Whisper",
                    url: "/settings#whisper",
                },
            ],
        },
    ];

    let navSecondary = [
        {
            title: "About",
            url: "/about",
            icon: LifeBuoy,
        },
    ];

    let breadcrubms = $derived(page.url.pathname.split("/"));

    let { children } = $props();

    onMount(async () => {
        await checkForAppUpdates(
            "https://github.com/synthlabs/scrybe/releases/latest",
        );
    });
</script>

<Sidebar.Provider>
    <AppSidebar {user} {navMain} {navSecondary} />
    <Sidebar.Inset>
        <header
            class="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b bg-background pl-4"
        >
            <Sidebar.Trigger class="-ml-1" />
            <Separator orientation="vertical" class="mr-2 h-4" />
            <Breadcrumb.Root>
                <Breadcrumb.List>
                    {#each breadcrubms as crumb}
                        <Breadcrumb.Item>
                            <Breadcrumb.Page>{crumb}</Breadcrumb.Page>
                        </Breadcrumb.Item>
                    {/each}
                </Breadcrumb.List>
            </Breadcrumb.Root>
            <div class="flex flex-grow"></div>
            <Separator orientation="vertical" class="mr-2 h-4" />
            <TranscriptControls />
        </header>
        <div class="container flex flex-grow py-6">
            {@render children?.()}
        </div>
    </Sidebar.Inset>
</Sidebar.Provider>
