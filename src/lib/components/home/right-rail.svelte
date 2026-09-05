<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import * as Collapsible from "$lib/components/ui/collapsible/index.ts";
    import * as Sheet from "$lib/components/ui/sheet/index.ts";
    import MetricHelp from "./metric-help.svelte";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
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

    type DetailSection = "audio_metrics" | "gate";

    let now = $state(Date.now());
    let interval: ReturnType<typeof setInterval> | null = null;
    let wide_layout = $state(false);
    let layout_query: MediaQueryList | null = null;

    const sync_layout = () => {
        wide_layout = layout_query?.matches ?? false;
    };

    onMount(() => {
        interval = setInterval(() => {
            now = Date.now();
        }, 1000);

        layout_query = window.matchMedia("(min-width: 1024px)");
        sync_layout();
        layout_query.addEventListener("change", sync_layout);
    });

    onDestroy(() => {
        if (interval) clearInterval(interval);
        layout_query?.removeEventListener("change", sync_layout);
    });

    let elapsed = $derived(
        session.started_at !== null ? now - session.started_at : 0,
    );
    let details_open = $derived(app_state.obj.home_right_rail.open);
    let show_audio_metrics = $derived(
        app_state.obj.home_right_rail.audio_metrics,
    );
    let show_gate = $derived(app_state.obj.home_right_rail.gate);

    let stats = $derived([
        {
            label: msgs.home_rail_started(),
            value: fmt_started(session.started_at),
        },
        {
            label: msgs.home_rail_duration(),
            value: fmt_duration(elapsed),
        },
        {
            label: msgs.home_rail_segments(),
            value: String(session.segments.length),
        },
        {
            label: msgs.home_rail_words(),
            value: String(session.word_count),
        },
    ]);

    let has_inference = $derived(audio_metrics.obj.inference_sample_count > 0);
    let has_vad = $derived(audio_metrics.obj.vad_total_evaluations > 0);

    let audio_stats = $derived([
        {
            label: msgs.home_rail_inference(),
            help: msgs.home_help_inference(),
            value: format_metric_ms(
                audio_metrics.obj.last_inference_ms,
                !has_inference,
            ),
        },
        {
            label: msgs.home_rail_rms(),
            help: msgs.home_help_rms(),
            value: format_rms(audio_metrics.obj.input_rms),
        },
        {
            label: msgs.home_rail_vad(),
            help: msgs.home_help_vad(),
            value: format_metric_ms(audio_metrics.obj.last_vad_ms, !has_vad),
        },
        {
            label: msgs.home_rail_vad_skip_rate(),
            help: msgs.home_help_vad_skip_rate(),
            value: format_percent(audio_metrics.obj.vad_skip_rate, !has_vad),
        },
        {
            label: msgs.home_rail_vad_speech_ratio(),
            help: msgs.home_help_vad_speech_ratio(),
            value: format_percent(audio_metrics.obj.vad_speech_ratio, !has_vad),
        },
    ]);

    let inference_distribution_stats = $derived([
        {
            label: msgs.home_rail_inference_deviation(),
            help: msgs.home_help_inference_deviation(),
            value: format_metric_ms(
                audio_metrics.obj.inference_std_dev_ms,
                !has_inference,
            ),
        },
        {
            label: msgs.home_rail_inference_p90(),
            help: msgs.home_help_inference_p90(),
            value: format_metric_ms(
                audio_metrics.obj.inference_p90_ms,
                !has_inference,
            ),
        },
        {
            label: msgs.home_rail_inference_p95(),
            help: msgs.home_help_inference_p95(),
            value: format_metric_ms(
                audio_metrics.obj.inference_p95_ms,
                !has_inference,
            ),
        },
        {
            label: msgs.home_rail_inference_p99(),
            help: msgs.home_help_inference_p99(),
            value: format_metric_ms(
                audio_metrics.obj.inference_p99_ms,
                !has_inference,
            ),
        },
    ]);

    let latest_gate_entries = $derived(
        gate_telemetry.obj.entries.slice(-12).reverse(),
    );

    function set_details_open(open: boolean) {
        app_state.obj.home_right_rail.open = open;
        app_state.sync();
    }

    function set_section_open(section: DetailSection, open: boolean) {
        app_state.obj.home_right_rail[section] = open;
        app_state.sync();
    }

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

    function format_percent(value: number, empty = false) {
        if (empty || !Number.isFinite(value)) return "-";
        return `${Math.round(value * 100)}%`;
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
            case "NoVoiceActivity":
                return msgs.home_rail_gate_reason_no_voice();
            case "KnownHallucination":
                return msgs.home_rail_gate_reason_known_hallucination();
            case "AmbiguousHallucination":
                return msgs.home_rail_gate_reason_ambiguous_hallucination();
            default:
                return msgs.home_rail_gate_suppress();
        }
    }
</script>

{#snippet sectionTrigger(label: string, open: boolean)}
    <span class="text-foreground text-sm font-medium">{label}</span>
    <ChevronDown
        class="text-muted-foreground ml-auto size-4 transition-transform duration-200 {open
            ? 'rotate-180'
            : ''}"
    />
{/snippet}

{#snippet detailsContent()}
    <div class="flex h-full min-h-0 flex-col">
        <div class="min-h-0 flex-1 overflow-y-auto">
            <section class="border-border border-b px-5 py-4 pr-16">
                <h2 class="text-foreground text-sm font-medium">
                    {msgs.home_rail_session()}
                </h2>
                <dl
                    class="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-x-4 gap-y-3 text-xs"
                >
                    {#each stats as stat (stat.label)}
                        <div class="min-w-0">
                            <dt class="text-muted-foreground">
                                {stat.label}
                            </dt>
                            <dd class="mt-1 font-mono tabular-nums">
                                {stat.value}
                            </dd>
                        </div>
                    {/each}
                </dl>
            </section>

            <Collapsible.Root
                open={show_audio_metrics}
                onOpenChange={(open) => set_section_open("audio_metrics", open)}
                class="border-border border-b"
            >
                <Collapsible.Trigger
                    class="hover:bg-accent focus-visible:ring-scrybe-ring focus-visible:ring-offset-card flex min-h-12 w-full items-center gap-2 px-5 py-3 text-left transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                    {@render sectionTrigger(
                        msgs.home_rail_audio_metrics(),
                        show_audio_metrics,
                    )}
                </Collapsible.Trigger>
                <Collapsible.Content>
                    <dl
                        class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-x-4 gap-y-3 px-5 pt-1 pb-4 text-xs"
                    >
                        {#each audio_stats as stat (stat.label)}
                            <div class="min-w-0">
                                <dt
                                    class="text-muted-foreground flex min-h-8 items-center gap-1"
                                >
                                    <span class="min-w-0 break-words"
                                        >{stat.label}</span
                                    >
                                    <MetricHelp
                                        label={stat.label}
                                        description={stat.help}
                                    />
                                </dt>
                                <dd class="mt-1 font-mono tabular-nums">
                                    {stat.value}
                                </dd>
                            </div>
                        {/each}
                    </dl>
                    <dl
                        class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-3 px-5 pb-5 text-xs"
                    >
                        {#each inference_distribution_stats as stat (stat.label)}
                            <div class="min-w-0">
                                <dt
                                    class="text-muted-foreground flex min-h-8 items-center gap-1"
                                >
                                    <span class="min-w-0 break-words"
                                        >{stat.label}</span
                                    >
                                    <MetricHelp
                                        label={stat.label}
                                        description={stat.help}
                                    />
                                </dt>
                                <dd class="mt-1 font-mono tabular-nums">
                                    {stat.value}
                                </dd>
                            </div>
                        {/each}
                    </dl>
                </Collapsible.Content>
            </Collapsible.Root>

            <Collapsible.Root
                open={show_gate}
                onOpenChange={(open) => set_section_open("gate", open)}
            >
                <Collapsible.Trigger
                    class="hover:bg-accent focus-visible:ring-scrybe-ring focus-visible:ring-offset-card flex min-h-12 w-full items-center gap-2 px-5 py-3 text-left transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                    {@render sectionTrigger(msgs.home_rail_gate(), show_gate)}
                </Collapsible.Trigger>
                <Collapsible.Content>
                    {#if latest_gate_entries.length === 0}
                        <p class="text-muted-foreground px-5 pt-1 pb-5 text-sm">
                            {msgs.home_rail_gate_empty()}
                        </p>
                    {:else}
                        <div class="overflow-x-auto px-5 pt-1 pb-5">
                            <table
                                class="w-full min-w-[26rem] table-fixed text-left text-xs"
                            >
                                <thead class="text-muted-foreground">
                                    <tr>
                                        <th class="w-16 px-1 pb-2 font-medium">
                                            <span
                                                class="inline-flex items-center gap-1"
                                            >
                                                {msgs.home_rail_gate_seq()}
                                                <MetricHelp
                                                    label={msgs.home_rail_gate_seq()}
                                                    description={msgs.home_help_gate_seq()}
                                                />
                                            </span>
                                        </th>
                                        <th class="px-1 pb-2 font-medium">
                                            <span
                                                class="inline-flex items-center gap-1"
                                            >
                                                {msgs.home_rail_gate_decision()}
                                                <MetricHelp
                                                    label={msgs.home_rail_gate_decision()}
                                                    description={msgs.home_help_gate_decision()}
                                                />
                                            </span>
                                        </th>
                                        <th
                                            class="w-20 px-1 pb-2 text-right font-medium"
                                        >
                                            <span
                                                class="inline-flex items-center gap-1"
                                            >
                                                {msgs.home_rail_gate_words()}
                                                <MetricHelp
                                                    label={msgs.home_rail_gate_words()}
                                                    description={msgs.home_help_gate_words()}
                                                />
                                            </span>
                                        </th>
                                        <th
                                            class="w-20 px-1 pb-2 text-right font-medium"
                                        >
                                            <span
                                                class="inline-flex items-center gap-1"
                                            >
                                                {msgs.home_rail_gate_distance()}
                                                <MetricHelp
                                                    label={msgs.home_rail_gate_distance()}
                                                    description={msgs.home_help_gate_distance()}
                                                />
                                            </span>
                                        </th>
                                        <th
                                            class="w-16 px-1 pb-2 text-right font-medium"
                                        >
                                            <span
                                                class="inline-flex items-center gap-1"
                                            >
                                                {msgs.home_rail_gate_time()}
                                                <MetricHelp
                                                    label={msgs.home_rail_gate_time()}
                                                    description={msgs.home_help_gate_time()}
                                                />
                                            </span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each latest_gate_entries as entry (entry.sequence)}
                                        <tr class="border-border border-t">
                                            <td
                                                class="text-muted-foreground px-1 py-2 font-mono tabular-nums"
                                            >
                                                {entry.sequence}
                                            </td>
                                            <td class="px-1 py-2">
                                                <span
                                                    class="block break-words {entry.decision ===
                                                    'Emit'
                                                        ? 'text-status-live'
                                                        : 'text-muted-foreground'}"
                                                    title={entry.segment_id}
                                                >
                                                    {decision_label(entry)}
                                                </span>
                                            </td>
                                            <td
                                                class="px-1 py-2 text-right font-mono tabular-nums"
                                            >
                                                {entry.candidate_words}
                                            </td>
                                            <td
                                                class="px-1 py-2 text-right font-mono tabular-nums"
                                            >
                                                {format_distance(entry)}
                                            </td>
                                            <td
                                                class="px-1 py-2 text-right font-mono tabular-nums"
                                            >
                                                {format_ms(entry.evaluate_ms)}
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    {/if}
                </Collapsible.Content>
            </Collapsible.Root>
        </div>
    </div>
{/snippet}

{#if wide_layout}
    <aside
        id="home-details"
        class="bg-card flex shrink-0 justify-end overflow-hidden border-l transition-[width,border-color] duration-200 ease-linear {details_open
            ? 'border-border w-[21.25rem]'
            : 'w-0 border-transparent'}"
        aria-label={msgs.home_details_title()}
        aria-hidden={!details_open}
        inert={!details_open}
    >
        <div class="h-full w-[21.25rem] shrink-0">
            {@render detailsContent()}
        </div>
    </aside>
{:else}
    <Sheet.Root open={details_open} onOpenChange={set_details_open}>
        <Sheet.Content
            id="home-details"
            closeLabel={msgs.home_details_close()}
            class="w-[22.5rem] max-w-full p-0 sm:max-w-[22.5rem]"
            onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (!details_open)
                    document.getElementById("home-details-toggle")?.focus();
            }}
        >
            <Sheet.Title class="sr-only">
                {msgs.home_details_title()}
            </Sheet.Title>
            <Sheet.Description class="sr-only">
                {msgs.home_toolbar_details()}
            </Sheet.Description>
            {@render detailsContent()}
        </Sheet.Content>
    </Sheet.Root>
{/if}
