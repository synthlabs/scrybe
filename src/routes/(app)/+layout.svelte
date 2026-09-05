<script lang="ts">
    import House from "@lucide/svelte/icons/house";
    import Settings2 from "@lucide/svelte/icons/settings-2";
    import Projector from "@lucide/svelte/icons/projector";
    import AppSidebar from "$lib/components/app-sidebar.svelte";
    import * as Sidebar from "$lib/components/ui/sidebar/index.ts";
    import { Toaster } from "$lib/components/ui/sonner/index.ts";
    import { onMount, onDestroy } from "svelte";
    import { checkForAppUpdates } from "$utils/updater";
    import { PUBLIC_UPDATE_INSTALL_MODE } from "$env/static/public";
    import { ErrorToast } from "$utils/inbound";
    import { m as msgs } from "$lib/paraglide/messages";
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import type { WhisperSegment } from "$lib/bindings";

    import StatusPill from "$lib/components/header/status-pill.svelte";
    import PlayPauseButton from "$lib/components/header/play-pause-button.svelte";
    import RuntimeDependencyNotice from "$lib/components/runtime-dependency-notice.svelte";
    import { session } from "$lib/stores/session.svelte";
    import { app_state, internal_state } from "$lib/stores/state.svelte";
    import { InternalRoot, navItems as internalNavItems } from "$internal";

    let navMain = $derived([
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
    ]);

    let { children } = $props();

    function set_sidebar_open(open: boolean) {
        if (!app_state.ready || app_state.obj.sidebar_open === open) return;
        app_state.obj.sidebar_open = open;
        app_state.sync();
    }

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
                updateAction:
                    PUBLIC_UPDATE_INSTALL_MODE === "package-manager"
                        ? {
                              kind: "external",
                              label: msgs.updater_package_manager(),
                              url: "https://github.com/synthlabs/scrybe#arch-linux-and-cachyos",
                          }
                        : { kind: "install" },
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

<Toaster />
<ErrorToast />
<RuntimeDependencyNotice />

<Sidebar.Provider
    open={app_state.obj.sidebar_open}
    onOpenChange={set_sidebar_open}
    controlledOpen
    style="--sidebar-width: 11.25rem"
>
    <AppSidebar {navMain} collapsible="icon" />
    <Sidebar.Inset class="h-svh min-h-0 overflow-hidden">
        <header
            class="bg-background sticky top-0 z-40 flex min-h-12 shrink-0 flex-wrap items-center gap-3 border-b px-3 py-2"
        >
            <Sidebar.Trigger disabled={!app_state.ready} />
            <div class="flex grow"></div>
            <StatusPill />
            <PlayPauseButton />
        </header>
        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {@render children?.()}
        </div>
    </Sidebar.Inset>
    <InternalRoot />
</Sidebar.Provider>
