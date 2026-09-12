<script lang="ts">
    import { onMount } from "svelte";
    import {
        overlay_editor,
        overlay_test,
    } from "$lib/stores/overlay-editor.svelte";
    import { Button } from "$lib/components/ui/button/index.ts";
    import { showActionError } from "$lib/home-errors";
    import { m as msgs } from "$lib/paraglide/messages";
    let now = $state(Date.now());
    onMount(() => {
        const timer = setInterval(() => (now = Date.now()), 250);
        return () => clearInterval(timer);
    });
    const active = $derived(
        overlay_test.obj.config !== null &&
            overlay_test.obj.expires_at_ms > now,
    );
    async function stop() {
        try {
            await overlay_editor.stopTest();
        } catch (error) {
            showActionError(
                msgs.overlay_error_test,
                msgs.overlay_error_test_help,
                error,
                "overlay_error_test",
            );
        }
    }
</script>

{#if active}
    <div
        class="border-border bg-card flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-sm"
        data-overlay-test-notice
    >
        <span
            >{msgs.overlay_testing({
                seconds: Math.max(
                    0,
                    Math.ceil((overlay_test.obj.expires_at_ms - now) / 1000),
                ),
            })}</span
        >
        <Button variant="ghost" size="sm" onclick={stop}
            >{msgs.overlay_stop_test()}</Button
        >
    </div>
{/if}
