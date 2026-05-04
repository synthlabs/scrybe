<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import {
        session,
        fmt_duration,
        fmt_started,
    } from "$lib/stores/session.svelte";
    import {
        app_state,
        audio_metrics,
        gate_telemetry,
    } from "$lib/stores/state.svelte";
    import type {
        GateEvaluationTelemetryEntry,
        SegmentSuppressionReason,
    } from "$lib/bindings";
    import { m as msgs } from "$lib/paraglide/messages";

    let now = $state(Date.now());
    let interval: ReturnType<typeof setInterval> | null = null;
    let gate_table_container: HTMLDivElement | null = $state(null);
    let gate_visible_count = $state(10);

    onMount(() => {
        interval = setInterval(() => {
            now = Date.now();
        }, 1000);
    });
    onDestroy(() => {
        if (interval) clearInterval(interval);
    });

    $effect(() => {
        const container = gate_table_container;
        if (!container) return;

        sync_gate_visible_count();
        const resize_observer = new ResizeObserver(sync_gate_visible_count);
        resize_observer.observe(container);

        return () => {
            resize_observer.disconnect();
        };
    });

    let elapsed = $derived(
        session.started_at !== null ? now - session.started_at : 0,
    );
    let show_session = $derived(app_state.obj.home_right_rail.session);
    let show_audio_metrics = $derived(
        app_state.obj.home_right_rail.audio_metrics,
    );
    let show_gate = $derived(app_state.obj.home_right_rail.gate);
    let show_rail = $derived(show_session || show_audio_metrics || show_gate);

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

    let has_inference = $derived(
        audio_metrics.obj.inference_sample_count > 0,
    );

    let audio_stats = $derived([
        {
            label: msgs.home_rail_inference(),
            value: format_metric_ms(
                audio_metrics.obj.last_inference_ms,
                !has_inference,
            ),
            mono: true,
        },
        {
            label: msgs.home_rail_rms(),
            value: format_rms(audio_metrics.obj.input_rms),
            mono: true,
        },
    ]);

    let inference_distribution_stats = $derived([
        {
            label: msgs.home_rail_inference_deviation(),
            value: format_metric_ms(
                audio_metrics.obj.inference_std_dev_ms,
                !has_inference,
            ),
            mono: true,
        },
        {
            label: msgs.home_rail_inference_p90(),
            value: format_metric_ms(
                audio_metrics.obj.inference_p90_ms,
                !has_inference,
            ),
            mono: true,
        },
        {
            label: msgs.home_rail_inference_p95(),
            value: format_metric_ms(
                audio_metrics.obj.inference_p95_ms,
                !has_inference,
            ),
            mono: true,
        },
        {
            label: msgs.home_rail_inference_p99(),
            value: format_metric_ms(
                audio_metrics.obj.inference_p99_ms,
                !has_inference,
            ),
            mono: true,
        },
    ]);

    let latest_gate_entries = $derived.by(() =>
        gate_visible_count <= 0
            ? []
            : gate_telemetry.obj.entries.slice(-gate_visible_count).reverse(),
    );

    function format_ms(ms: number) {
        return ms < 10 ? ms.toFixed(1) : ms.toFixed(0);
    }

    function format_metric_ms(ms: number, empty = false) {
        if (empty || !Number.isFinite(ms)) return "-";
        return `${format_ms(ms)} ms`;
    }

    function format_rms(value: number) {
        if (!Number.isFinite(value) || value <= 0) return "0.000";
        return value < 1 ? value.toFixed(3) : value.toFixed(2);
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

    function sync_gate_visible_count() {
        if (!gate_table_container) return;

        const header_height = 26;
        const row_height = 29;
        const available_rows_height = Math.max(
            0,
            gate_table_container.clientHeight - header_height,
        );
        gate_visible_count = Math.max(
            0,
            Math.floor(available_rows_height / row_height),
        );
    }
</script>

{#if show_rail}
    <aside
        class="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-border bg-card/40"
    >
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
            {#if show_session}
                <section class="shrink-0">
                    <header class="px-4 pb-2 pt-4">
                        <h2
                            class="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                        >
                            {msgs.home_rail_session()}
                        </h2>
                    </header>
                    <dl class="grid grid-cols-2 gap-x-4 gap-y-2 px-4 pb-4 text-[12px]">
                        {#each stats as stat (stat.label)}
                            <div class="min-w-0">
                                <dt class="text-muted-foreground">{stat.label}</dt>
                                <dd
                                    class="truncate text-foreground {stat.mono
                                        ? 'font-mono tabular-nums'
                                        : ''}"
                                >
                                    {stat.value}
                                </dd>
                            </div>
                        {/each}
                    </dl>
                </section>
            {/if}

            {#if show_audio_metrics}
                <section
                    class="shrink-0 {show_session
                        ? 'border-t border-border/70'
                        : ''}"
                >
                    <header class="px-4 pb-2 pt-4">
                        <h2
                            class="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                        >
                            {msgs.home_rail_audio_metrics()}
                        </h2>
                    </header>
                    <dl class="grid grid-cols-2 gap-x-4 gap-y-2 px-4 pb-4 text-[12px]">
                        {#each audio_stats as stat (stat.label)}
                            <div class="min-w-0">
                                <dt class="text-muted-foreground">{stat.label}</dt>
                                <dd
                                    class="truncate text-foreground {stat.mono
                                        ? 'font-mono tabular-nums'
                                        : ''}"
                                >
                                    {stat.value}
                                </dd>
                            </div>
                        {/each}
                    </dl>
                    <dl class="grid grid-cols-4 gap-x-2 px-4 pb-4 text-[11px]">
                        {#each inference_distribution_stats as stat (stat.label)}
                            <div class="min-w-0">
                                <dt class="truncate text-muted-foreground">
                                    {stat.label}
                                </dt>
                                <dd
                                    class="truncate text-foreground {stat.mono
                                        ? 'font-mono tabular-nums'
                                        : ''}"
                                >
                                    {stat.value}
                                </dd>
                            </div>
                        {/each}
                    </dl>
                </section>
            {/if}

            {#if show_gate}
                <section
                    class="flex min-h-0 flex-1 flex-col overflow-hidden {show_session ||
                    show_audio_metrics
                        ? 'border-t border-border/70'
                        : ''}"
                >
                    <header class="flex items-center justify-between px-4 pb-2 pt-4">
                        <h2
                            class="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                        >
                            {msgs.home_rail_gate()}
                        </h2>
                        <span
                            class="font-mono text-[11px] tabular-nums text-muted-foreground"
                        >
                            {gate_telemetry.obj.entries.length}
                        </span>
                    </header>

                    {#if gate_telemetry.obj.entries.length === 0}
                        <p class="px-4 pb-4 text-[12px] text-muted-foreground">
                            {msgs.home_rail_gate_empty()}
                        </p>
                    {:else}
                        <div
                            bind:this={gate_table_container}
                            class="min-h-0 flex-1 overflow-hidden px-3 pb-4"
                        >
                            <table class="w-full table-fixed text-left text-[11px]">
                                <thead class="text-[10px] text-muted-foreground">
                                    <tr>
                                        <th class="w-10 px-1 pb-2 font-medium">
                                            {msgs.home_rail_gate_seq()}
                                        </th>
                                        <th class="px-1 pb-2 font-medium">
                                            {msgs.home_rail_gate_decision()}
                                        </th>
                                        <th
                                            class="w-12 px-1 pb-2 text-right font-medium"
                                        >
                                            {msgs.home_rail_gate_words()}
                                        </th>
                                        <th
                                            class="w-12 px-1 pb-2 text-right font-medium"
                                        >
                                            {msgs.home_rail_gate_distance()}
                                        </th>
                                        <th
                                            class="w-14 px-1 pb-2 text-right font-medium"
                                        >
                                            {msgs.home_rail_gate_time()}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody class="font-mono tabular-nums">
                                    {#each latest_gate_entries as entry (entry.sequence)}
                                        <tr class="border-t border-border/40">
                                            <td
                                                class="px-1 py-1.5 text-muted-foreground"
                                            >
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
            {/if}
        </div>
    </aside>
{/if}
