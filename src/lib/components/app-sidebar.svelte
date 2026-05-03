<script lang="ts">
    import NavMain from "$lib/components/nav-main.svelte";
    import * as Sidebar from "$lib/components/ui/sidebar/index.ts";
    import {
        LanguageController,
        LanguageSwitcher,
    } from "@synthlabs/i18n/svelte";
    import * as paraglideRuntime from "$lib/paraglide/runtime";
    import { m as msgs } from "$lib/paraglide/messages";
    import LifeBuoy from "@lucide/svelte/icons/life-buoy";

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
    const localeLabels: Record<string, string> = {
        en: msgs.locale_label_en(),
        ru: msgs.locale_label_ru(),
    };
</script>

<Sidebar.Root bind:ref {variant} {...restProps}>
    <Sidebar.Content>
        <NavMain items={navMain} />
    </Sidebar.Content>
    <Sidebar.Footer class="p-3">
        <div class="flex items-center justify-between gap-2">
            <LanguageSwitcher
                controller={language}
                labels={localeLabels}
                accentColor="hsl(var(--c-scrybe))"
            />
            <a
                href="/about"
                aria-label={msgs.sidebar_about()}
                class="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
                <LifeBuoy class="size-4" />
            </a>
        </div>
    </Sidebar.Footer>
</Sidebar.Root>
