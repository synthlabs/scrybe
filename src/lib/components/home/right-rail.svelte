<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import {
        session,
        fmt_duration,
        fmt_started,
    } from "$lib/stores/session.svelte";
    import { m as msgs } from "$lib/paraglide/messages";

    let now = $state(Date.now());
    let interval: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        interval = setInterval(() => {
            now = Date.now();
        }, 1000);
    });
    onDestroy(() => {
        if (interval) clearInterval(interval);
    });

    let elapsed = $derived(
        session.started_at !== null ? now - session.started_at : 0,
    );

    let stats = $derived([
        {
            label: msgs.home_rail_started(),
            value: fmt_started(session.started_at),
            mono: true,
        },
        {
            label: msgs.home_rail_duration(),
            value: fmt_duration(elapsed),
            mono: true,
        },
        {
            label: msgs.home_rail_segments(),
            value: String(session.segments.length),
            mono: true,
        },
        {
            label: msgs.home_rail_words(),
            value: String(session.word_count),
            mono: true,
        },
    ]);
</script>

<aside
    class="flex w-[240px] shrink-0 flex-col border-l border-border bg-card/40"
>
    <header class="px-4 pb-2 pt-4">
        <h2
            class="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
        >
            {msgs.home_rail_session()}
        </h2>
    </header>
    <dl class="flex flex-col gap-2 px-4 pb-4 text-[12px]">
        {#each stats as stat (stat.label)}
            <div class="flex items-baseline justify-between gap-2">
                <dt class="text-muted-foreground">{stat.label}</dt>
                <dd
                    class="text-foreground {stat.mono
                        ? 'font-mono tabular-nums'
                        : ''}"
                >
                    {stat.value}
                </dd>
            </div>
        {/each}
    </dl>
</aside>
