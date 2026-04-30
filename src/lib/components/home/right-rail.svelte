<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { SyncedState } from "tauri-svelte-synced-store";
    import {
        session,
        fmt_duration,
        fmt_started,
    } from "$lib/stores/session.svelte";
    import { DefaultGateTelemetryState } from "$lib/defaults";
    import type {
        GateEvaluationTelemetryEntry,
        GateTelemetryState,
        SegmentSuppressionReason,
    } from "$lib/bindings";
    import { m as msgs } from "$lib/paraglide/messages";

    let now = $state(Date.now());
    let interval: ReturnType<typeof setInterval> | null = null;
    let gate_telemetry = new SyncedState<GateTelemetryState>(
        "gate_telemetry",
        DefaultGateTelemetryState,
    );

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

    let latest_gate_entries = $derived.by(() =>
        gate_telemetry.obj.entries.slice(-10).reverse(),
    );

    function format_ms(ms: number) {
        return ms < 10 ? ms.toFixed(1) : ms.toFixed(0);
    }

    function format_distance(entry: GateEvaluationTelemetryEntry) {
        if (entry.distance === null) return "-";
        return String(entry.distance);
    }

    function decision_label(entry: GateEvaluationTelemetryEntry) {
        if (entry.decision === "Emit") return msgs.home_rail_gate_emit();
        return reason_label(entry.suppression_reason);
    }

    function reason_label(reason: SegmentSuppressionReason | null) {
        switch (reason) {
            case "Empty":
                return msgs.home_rail_gate_reason_empty();
            case "DuplicateNormalizedText":
                return msgs.home_rail_gate_reason_duplicate();
            case "PendingDrasticChange":
                return msgs.home_rail_gate_reason_drastic();
            default:
                return msgs.home_rail_gate_suppress();
        }
    }
</script>

<aside
    class="flex w-[360px] shrink-0 flex-col border-l border-border bg-card/40"
>
    <div class="min-h-0 overflow-y-auto">
        <section>
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
        </section>

        <section class="border-t border-border/70">
            <header class="flex items-center justify-between px-4 pb-2 pt-4">
                <h2
                    class="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                >
                    {msgs.home_rail_gate()}
                </h2>
                <span class="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {gate_telemetry.obj.entries.length}
                </span>
            </header>

            {#if latest_gate_entries.length === 0}
                <p class="px-4 pb-4 text-[12px] text-muted-foreground">
                    {msgs.home_rail_gate_empty()}
                </p>
            {:else}
                <div class="px-3 pb-4">
                    <table class="w-full table-fixed text-left text-[11px]">
                        <thead class="text-[10px] text-muted-foreground">
                            <tr>
                                <th class="w-10 px-1 pb-2 font-medium">
                                    {msgs.home_rail_gate_seq()}
                                </th>
                                <th class="px-1 pb-2 font-medium">
                                    {msgs.home_rail_gate_decision()}
                                </th>
                                <th class="w-12 px-1 pb-2 text-right font-medium">
                                    {msgs.home_rail_gate_words()}
                                </th>
                                <th class="w-12 px-1 pb-2 text-right font-medium">
                                    {msgs.home_rail_gate_distance()}
                                </th>
                                <th class="w-14 px-1 pb-2 text-right font-medium">
                                    {msgs.home_rail_gate_time()}
                                </th>
                            </tr>
                        </thead>
                        <tbody class="font-mono tabular-nums">
                            {#each latest_gate_entries as entry (entry.sequence)}
                                <tr class="border-t border-border/40">
                                    <td class="px-1 py-1.5 text-muted-foreground">
                                        {entry.sequence}
                                    </td>
                                    <td class="px-1 py-1.5">
                                        <span
                                            class="block truncate {entry.decision ===
                                            'Emit'
                                                ? 'text-status-live'
                                                : 'text-muted-foreground'}"
                                            title={entry.segment_id}
                                        >
                                            {decision_label(entry)}
                                        </span>
                                    </td>
                                    <td class="px-1 py-1.5 text-right">
                                        {entry.candidate_words}
                                    </td>
                                    <td class="px-1 py-1.5 text-right">
                                        {format_distance(entry)}
                                    </td>
                                    <td class="px-1 py-1.5 text-right">
                                        {format_ms(entry.evaluate_ms)}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        </section>
    </div>
</aside>
