<script lang="ts">
    import House from "@lucide/svelte/icons/house";
    import Settings2 from "@lucide/svelte/icons/settings-2";
    import Projector from "@lucide/svelte/icons/projector";
    import AppSidebar from "$lib/components/app-sidebar.svelte";
    import { Separator } from "$lib/components/ui/separator/index.ts";
    import * as Sidebar from "$lib/components/ui/sidebar/index.ts";
    import { onMount, onDestroy } from "svelte";
    import { checkForAppUpdates } from "$utils/updater";
    import { m as msgs } from "$lib/paraglide/messages";
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import type { WhisperSegment } from "$lib/bindings";

    import StatusPill from "$lib/components/header/status-pill.svelte";
    import PlayPauseButton from "$lib/components/header/play-pause-button.svelte";
    import RuntimeDependencyNotice from "$lib/components/runtime-dependency-notice.svelte";
    import { header } from "$lib/stores/header.svelte";
    import { session } from "$lib/stores/session.svelte";
    import { internal_state } from "$lib/stores/state.svelte";
    import { InternalRoot, navItems as internalNavItems } from "$internal";

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
        ...internalNavItems,
    ];

    let { children } = $props();

    let unsub_segment: UnlistenFn | undefined;

    onMount(async () => {
        unsub_segment = await listen<WhisperSegment>(
            "segment_update",
            (event) => {
                session.add_segment(event.payload);
                session.mark_started();
            },
        );
        await checkForAppUpdates(
            "https://github.com/synthlabs/scrybe/releases/latest",
            {
                copy: {
                    updateAvailable: (version) =>
                        msgs.updater_update_available({ version }),
                    releaseNotes: msgs.updater_release_notes(),
                    dismiss: msgs.updater_dismiss(),
                    update: msgs.updater_update(),
                    downloading: msgs.updater_downloading(),
                    downloadingProgress: (percent) =>
                        msgs.updater_downloading_progress({ percent }),
                    installing: msgs.updater_installing(),
                    restarting: msgs.updater_restarting(),
                    installFailed: (error) =>
                        msgs.updater_install_failed({ error }),
                },
            },
        );
    });

    onDestroy(() => {
        unsub_segment?.();
    });

    $effect(() => {
        if (
            internal_state.obj.transcribe_running &&
            session.started_at === null
        ) {
            session.mark_started();
        }
    });
</script>

<RuntimeDependencyNotice />

<Sidebar.Provider style="--sidebar-width: 200px">
    <AppSidebar {navMain} />
    <Sidebar.Inset class="h-svh min-h-0 overflow-hidden">
        <header
            class="bg-background sticky top-0 z-50 flex h-12 shrink-0 items-center gap-2 border-b pr-3 pl-2"
        >
            <Sidebar.Trigger class="ml-1" />
            {#if header.title}
                <Separator orientation="vertical" class="mx-1 h-4" />
                <span class="text-sm font-semibold">{header.title}</span>
            {/if}
            {#if header.extras}
                <Separator orientation="vertical" class="mx-1 h-4" />
                {@render header.extras()}
            {/if}
            <div class="flex grow"></div>
            {#if header.extras_right}
                {@render header.extras_right()}
                <Separator orientation="vertical" class="mx-1 h-4" />
            {/if}
            <StatusPill />
            <PlayPauseButton />
        </header>
        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {@render children?.()}
        </div>
    </Sidebar.Inset>
    <InternalRoot />
</Sidebar.Provider>
