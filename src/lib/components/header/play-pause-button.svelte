<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.ts";
    import Play from "@lucide/svelte/icons/play";
    import LoaderCircle from "@lucide/svelte/icons/loader-circle";
    import Pause from "@lucide/svelte/icons/pause";
    import { invoke } from "@tauri-apps/api/core";
    import { toast } from "svelte-sonner";
    import Logger from "$utils/log";
    import { cn } from "$lib/utils";
    import { m as msgs } from "$lib/paraglide/messages";
    import { internal_state } from "$lib/stores/state.svelte";

    let debounce = $state(false);
    let listening = $derived(internal_state.obj.transcribe_running);

    const toggle = async () => {
        debounce = true;
        try {
            if (listening) {
                Logger.info("Currently running, stopping...");
                await invoke("stop_transcribe");
            } else {
                Logger.info("Currently NOT running, starting...");
                await invoke("start_transcribe");
            }
        } catch (e) {
            Logger.error("toggle transcribe failed", e);
            toast.error(msgs.runtime_start_failed({ error: String(e) }));
        } finally {
            setTimeout(() => (debounce = false), 1000);
        }
    };
</script>

<Button
    variant="ghost"
    size="icon"
    onclick={toggle}
    disabled={debounce}
    class={cn(
        "h-8 w-8 transition-colors",
        listening
            ? "border border-scrybe/40 bg-background/35 text-scrybe-ring hover:bg-accent/35"
            : "text-scrybe/90 hover:bg-accent/30 hover:text-scrybe",
    )}
    aria-label={listening ? "Pause" : "Play"}
>
    {#if debounce}
        <LoaderCircle class="animate-spin" />
    {:else if listening}
        <Pause />
    {:else}
        <Play />
    {/if}
</Button>
