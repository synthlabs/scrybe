<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.ts";
    import Play from "@lucide/svelte/icons/play";
    import LoaderCircle from "@lucide/svelte/icons/loader-circle";
    import Pause from "@lucide/svelte/icons/pause";
    import { invoke } from "@tauri-apps/api/core";
    import { showHomeActionError } from "$lib/home-errors";
    import Logger from "$utils/log";
    import { m as msgs } from "$lib/paraglide/messages";
    import { internal_state } from "$lib/stores/state.svelte";
    import { settings_editor } from "$lib/stores/settings-editor.svelte";

    let starting = $derived(internal_state.obj.transcribe_starting);
    let debounce = $state(false);
    let listening = $derived(internal_state.obj.transcribe_running);

    const toggle = async () => {
        if (debounce && !starting) return;
        const action = listening || starting ? "stop" : "start";
        debounce = true;
        try {
            if (listening || starting) {
                Logger.info("Currently running, stopping...");
                await invoke("stop_transcribe");
            } else {
                Logger.info("Currently NOT running, starting...");
                await invoke("start_transcribe");
            }
        } catch (e) {
            if (String(e) !== "Audio capture was cancelled.")
                showHomeActionError(action, e);
        } finally {
            setTimeout(() => (debounce = false), 1000);
        }
    };
</script>

<Button
    variant="outline"
    size="sm"
    onclick={toggle}
    disabled={(debounce && !starting) ||
        (!listening && !starting && settings_editor.busy)}
    aria-pressed={listening}
    aria-busy={debounce || starting}
    class="border-border text-muted-foreground hover:bg-accent hover:text-foreground min-w-29 bg-transparent shadow-none"
    aria-label={starting
        ? msgs.audio_cancel_start()
        : listening
          ? msgs.header_stop_captions()
          : msgs.header_start_captions()}
>
    {#if debounce || starting}
        <LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" />
    {:else if listening}
        <Pause class="size-4" />
    {:else}
        <Play class="size-4" />
    {/if}
    <span>
        {starting
            ? msgs.audio_cancel_start()
            : listening
              ? msgs.header_stop_captions()
              : msgs.header_start_captions()}
    </span>
</Button>
