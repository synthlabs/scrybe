<script lang="ts">
    import TranscriptRow from "$lib/components/home/transcript-row.svelte";
    import { session } from "$lib/stores/session.svelte";
    import { m as msgs } from "$lib/paraglide/messages";

    let partial_id = $derived(session.partial_id);

    let container: HTMLDivElement | null = $state(null);

    $effect(() => {
        // depend on total character count so partial-segment growth also scrolls
        const _ = session.segments.reduce(
            (a, s) => a + s.items.reduce((b, i) => b + i.text.length, 0),
            0,
        );
        if (container) {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                    .matches
                    ? "instant"
                    : "smooth",
            });
        }
    });
</script>

<div
    bind:this={container}
    class="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5"
>
    {#if session.segments.length === 0}
        <div
            class="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col items-center justify-center-safe px-6 text-center"
        >
            <img
                src="/scrybe-logo.png"
                alt=""
                class="scrybe-logo mb-5 size-12"
            />
            <h1
                class="text-foreground text-xl font-semibold tracking-[-0.02em]"
            >
                {msgs.home_empty_title()}
            </h1>
            <p class="text-muted-foreground mt-2 text-sm leading-6">
                {msgs.home_empty_body()}
            </p>
            <a
                href="/settings"
                class="text-scrybe focus-visible:ring-scrybe-ring focus-visible:ring-offset-background mt-4 inline-flex min-h-8 items-center rounded-md px-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
                {msgs.home_empty_settings()}
            </a>
        </div>
    {:else}
        <div class="mx-auto w-full max-w-4xl pb-8">
            {#each session.segments as segment (segment.id)}
                <TranscriptRow {segment} partial={segment.id === partial_id} />
            {/each}
        </div>
    {/if}
</div>
