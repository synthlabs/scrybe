<script lang="ts">
    import NavMain from "$lib/components/nav-main.svelte";
    import * as Sidebar from "$lib/components/ui/sidebar/index.ts";
    import {
        LanguageController,
        LanguageSwitcher,
    } from "@synthlabs/i18n/svelte";
    import * as paraglideRuntime from "$lib/paraglide/runtime";
    import { m as msgs } from "$lib/paraglide/messages";
    import { page } from "$app/state";
    import LifeBuoy from "@lucide/svelte/icons/life-buoy";
    import * as Tooltip from "$lib/components/ui/tooltip/index.ts";

    interface NavItem {
        title: string;
        url: string;
        icon: any;
    }
    interface Props {
        ref?: any;
        navMain: NavItem[];
        side?: "left" | "right";
        variant?: "sidebar" | "floating" | "inset";
        collapsible?: "offcanvas" | "icon" | "none";
    }

    let {
        ref = $bindable(null),
        navMain,
        variant,
        ...restProps
    }: Props = $props();

    const language = new LanguageController(paraglideRuntime);
    const sidebar = Sidebar.useSidebar();
    let desktopCollapsed = $derived(
        !sidebar.isMobile && sidebar.state === "collapsed",
    );
    const localeLabels: Record<string, string> = {
        en: msgs.locale_label_en(),
        ru: msgs.locale_label_ru(),
    };
</script>

<Sidebar.Root bind:ref {variant} panelClass="bg-card" {...restProps}>
    <Sidebar.Header class="h-12 shrink-0 justify-center p-0">
        <a
            href="/"
            class="focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar flex min-h-8 w-full items-center gap-2 overflow-hidden rounded-md px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            aria-label="Scrybe"
        >
            <img
                src="/scrybe-logo.png"
                alt=""
                class="scrybe-logo size-6 shrink-0"
            />
            <span
                class="text-foreground block max-w-32 overflow-hidden text-(length:--scrybe-text-wordmark) font-semibold tracking-[0.08em] whitespace-nowrap opacity-100 transition-[max-width,opacity] duration-(--scrybe-duration-standard) ease-linear group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0"
                >SCRYBE</span
            >
        </a>
    </Sidebar.Header>
    <Sidebar.Content class="px-1">
        <NavMain items={navMain} />
    </Sidebar.Content>
    <Sidebar.Footer
        class="max-h-16 overflow-visible p-3 opacity-100 transition-[max-height,opacity,padding] duration-(--scrybe-duration-standard) ease-linear group-data-[collapsible=icon]:max-h-0 group-data-[collapsible=icon]:overflow-hidden group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:opacity-0"
        aria-hidden={desktopCollapsed}
        inert={desktopCollapsed}
    >
        <div class="flex items-center justify-between gap-2">
            <LanguageSwitcher
                controller={language}
                labels={localeLabels}
                accentColor="var(--c-scrybe)"
            />
            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <a
                            {...props}
                            href="/about"
                            aria-label={msgs.sidebar_about()}
                            aria-current={page.url.pathname === "/about"
                                ? "page"
                                : undefined}
                            data-active={page.url.pathname === "/about"}
                            class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-sidebar-ring data-[active=true]:text-scrybe data-[active=true]:hover:text-scrybe focus-visible:ring-offset-sidebar inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-(--scrybe-duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            <LifeBuoy class="size-4" />
                        </a>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right"
                    >{msgs.sidebar_about()}</Tooltip.Content
                >
            </Tooltip.Root>
        </div>
    </Sidebar.Footer>
</Sidebar.Root>
