<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.ts";
    import Play from "@lucide/svelte/icons/play";
    import LoaderCircle from "@lucide/svelte/icons/loader-circle";
    import Pause from "@lucide/svelte/icons/pause";
    import { session_actions } from "$lib/stores/session-actions.svelte";
    import { m as msgs } from "$lib/paraglide/messages";
    import { internal_state } from "$lib/stores/state.svelte";
    import { settings_editor } from "$lib/stores/settings-editor.svelte";

    let starting = $derived(session_actions.starting);
    let listening = $derived(internal_state.obj.transcribe_running);

    const toggle = () => {
        if (starting || listening) void session_actions.stop();
        else void session_actions.start();
    };
</script>

<Button
    variant="outline"
    size="sm"
    onclick={toggle}
    disabled={session_actions.stopping ||
        (!listening && !starting && settings_editor.busy)}
    aria-pressed={listening}
    aria-busy={session_actions.pending !== null || starting}
    class="border-border text-muted-foreground hover:bg-accent hover:text-foreground min-w-29 bg-transparent shadow-none"
    aria-label={starting
        ? msgs.audio_cancel_start()
        : listening
          ? msgs.header_stop_captions()
          : msgs.header_start_captions()}
>
    {#if session_actions.pending !== null || starting}
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
