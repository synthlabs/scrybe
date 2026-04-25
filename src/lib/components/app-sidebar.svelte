<script lang="ts">
    import NavMain from "$lib/components/nav-main.svelte";
    import * as Sidebar from "$lib/components/ui/sidebar/index.ts";
    import { SyncedState } from "tauri-svelte-synced-store";
    import { DefaultInternalState } from "$lib/defaults";
    import type { InternalState } from "$lib/bindings";
    import { LanguageController, LanguageSwitcher } from "@synthlabs/i18n/svelte";
    import * as paraglideRuntime from "$lib/paraglide/runtime";
    import { m as msgs } from "$lib/paraglide/messages";

    interface NavItem {
        title: string;
        url: string;
        icon: any;
    }
    interface Props {
        ref?: any;
        navMain: NavItem[];
        navSecondary: NavItem[];
        side?: "left" | "right";
        variant?: "sidebar" | "floating" | "inset";
        collapsible?: "offcanvas" | "icon" | "none";
    }

    let {
        ref = $bindable(null),
        navMain,
        navSecondary,
        variant,
        ...restProps
    }: Props = $props();

    let internal_state = new SyncedState<InternalState>(
        "internal_state",
        DefaultInternalState,
    );

    const language = new LanguageController(paraglideRuntime);
    const localeLabels: Record<string, string> = {
        en: msgs.locale_label_en(),
        ru: msgs.locale_label_ru(),
    };
</script>

<Sidebar.Root bind:ref {variant} {...restProps}>
    <Sidebar.Header class="gap-1 p-3">
        <a
            href="/"
            class="flex items-center gap-2 rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-scrybe-ring"
        >
            <img
                src="/scrybe-logo.png"
                alt="Scrybe"
                class="h-[22px] w-[22px]"
                style="filter: drop-shadow(0 1px 4px hsl(17 75% 50% / 0.3));"
            />
            <span class="text-sm font-semibold tracking-tight">Scrybe</span>
            {#if internal_state.obj.version}
                <span
                    class="ml-auto rounded-full border border-border/50 px-1.5 text-[10px] font-medium text-muted-foreground"
                >
                    {internal_state.obj.version}
                </span>
            {/if}
        </a>
    </Sidebar.Header>
    <Sidebar.Content>
        <NavMain items={navMain} />
    </Sidebar.Content>
    <Sidebar.Footer class="gap-2 p-3">
        <LanguageSwitcher controller={language} labels={localeLabels} />
        {#each navSecondary as item (item.title)}
            <Sidebar.Menu>
                <Sidebar.MenuItem>
                    <Sidebar.MenuButton size="sm">
                        {#snippet child({ props })}
                            <a href={item.url} {...props}>
                                <item.icon />
                                <span>{item.title}</span>
                            </a>
                        {/snippet}
                    </Sidebar.MenuButton>
                </Sidebar.MenuItem>
            </Sidebar.Menu>
        {/each}
    </Sidebar.Footer>
</Sidebar.Root>
