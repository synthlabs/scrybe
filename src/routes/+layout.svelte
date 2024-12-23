<script lang="ts">
    import LifeBuoy from "lucide-svelte/icons/life-buoy";
    import House from "lucide-svelte/icons/house";
    import Settings2 from "lucide-svelte/icons/settings-2";
    import Bot from "lucide-svelte/icons/bot";
    import { page } from "$app/state";

    import AppSidebar from "$lib/components/app-sidebar.svelte";
    import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.ts";
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import * as Sidebar from "$lib/components/ui/sidebar/index.ts";

    import "../app.css";

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
        {
            title: "Models",
            url: "/models",
            icon: Bot,
        },
        {
            title: "Settings",
            url: "/settings",
            icon: Settings2,
            items: [
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
</script>

<Sidebar.Provider>
    <AppSidebar {user} {navMain} {navSecondary} />
    <Sidebar.Inset>
        <header class="flex h-16 shrink-0 items-center gap-2">
            <div class="flex items-center gap-2 px-4">
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
            </div>
        </header>
        <div class="overflow-x-hidden overflow-y-scroll">
            {@render children?.()}
        </div>
    </Sidebar.Inset>
</Sidebar.Provider>
