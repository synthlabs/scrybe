<script lang="ts">
    import { onMount, type ComponentType } from "svelte";
    import { toast } from "svelte-sonner";
    import {
        connectErrorCapture,
        logHandledError,
    } from "$utils/inbound/capture";
    import ReportWizard from "$utils/inbound/ReportWizard.svelte";
    import type { ErrorSnapshot } from "$utils/inbound/controller";
    import { errors, restoreReportFocus } from "$lib/errors";
    import { reportCopy } from "$lib/errors/copy";
    import { Button } from "$lib/components/ui/button";
    import { Switch } from "$lib/components/ui/switch";
    import * as Sheet from "$lib/components/ui/sheet";
    import ErrorToast from "./error-toast.svelte";

    let snapshot: ErrorSnapshot = $state(errors.snapshot());
    const copy = $derived(reportCopy());
    const presented = new Map<string, string>();
    let presentationSequence = 0;
    onMount(() => {
        const unsubscribe = errors.subscribe((value) => (snapshot = value));
        const stop = errors.start();
        const disconnect = connectErrorCapture(errors, window);
        return () => {
            unsubscribe();
            stop();
            disconnect();
            for (const toastId of presented.values()) toast.dismiss(toastId);
            presented.clear();
        };
    });

    $effect(() => {
        const wanted = new Set(
            snapshot.notifications.map((notification) => notification.id),
        );
        for (const [id, toastId] of presented) {
            if (!wanted.has(id)) {
                toast.dismiss(toastId);
                presented.delete(id);
            }
        }
        for (const notification of snapshot.notifications) {
            const toastId =
                presented.get(notification.id) ??
                `inbound-toast-${++presentationSequence}`;
            // Sonner 0.3 types custom components as Svelte 4 constructors.
            toast.custom(ErrorToast as unknown as ComponentType, {
                id: toastId,
                duration: Infinity,
                class: "right-0",
                componentProps: { notification },
                onDismiss: () => errors.dismiss(notification.id),
            });
            presented.set(notification.id, toastId);
        }
    });
</script>

<Sheet.Root
    open={snapshot.report !== null}
    onOpenChange={(open) => {
        if (!open) errors.closeReport();
    }}
>
    <Sheet.Content
        class="flex w-full flex-col overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={restoreReportFocus}
    >
        {#if snapshot.report}
            {#key snapshot.report.id}
                <ReportWizard
                    class="scrybe-report flex-1"
                    prefilledError={snapshot.report.error}
                    submitSnapshot
                    {copy}
                    onerror={(error) =>
                        logHandledError(error, "inbound.report")}
                    onclose={() => errors.closeReport()}
                >
                    {#snippet header()}
                        <Sheet.Title>{copy.title}</Sheet.Title>
                        <Sheet.Description class="mt-2 leading-5"
                            >{copy.description}</Sheet.Description
                        >
                    {/snippet}
                    {#snippet action(props)}
                        <Button
                            variant={props.kind === "back"
                                ? "ghost"
                                : "outline"}
                            size="sm"
                            disabled={props.disabled}
                            onclick={props.onclick}
                            data-inbound-action={props.kind}
                            >{props.label}</Button
                        >
                    {/snippet}
                    {#snippet includeToggle(props)}
                        <div
                            class="border-border bg-card flex items-start gap-3 rounded-lg border p-4"
                        >
                            <Switch
                                id={props.id}
                                checked={props.checked}
                                onCheckedChange={props.onchange}
                                aria-describedby={`${props.id}-description`}
                            />
                            <div class="grid min-w-0 gap-1">
                                <label
                                    class="cursor-pointer text-sm font-medium"
                                    for={props.id}>{props.title}</label
                                >
                                <p
                                    id={`${props.id}-description`}
                                    class="text-muted-foreground text-sm leading-5"
                                >
                                    {props.description}
                                </p>
                            </div>
                        </div>
                    {/snippet}
                </ReportWizard>
            {/key}
        {/if}
    </Sheet.Content>
</Sheet.Root>

<style>
    :global(.scrybe-report [aria-hidden="true"] .bg-muted) {
        background: var(--border);
    }
    :global(.scrybe-report [data-inbound-preview]) {
        background: var(--background);
        border: 1px solid var(--border);
        border-radius: var(--scrybe-radius-panel);
        padding: 0.75rem;
        max-height: 16rem;
        overflow: auto;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font: var(--scrybe-text-meta)/1.5 var(--scrybe-font-mono);
    }
    :global(.scrybe-report input:focus-visible),
    :global(.scrybe-report textarea:focus-visible),
    :global(.scrybe-report summary:focus-visible) {
        outline: var(--scrybe-focus-width) solid var(--scrybe-color-focus);
        outline-offset: var(--scrybe-focus-offset);
    }
    :global(.scrybe-report summary) {
        cursor: pointer;
        border-radius: var(--scrybe-radius-control);
        padding: 0.5rem 0;
    }
    :global(.scrybe-report [data-inbound-footer]) {
        position: sticky;
        bottom: -1.5rem;
        padding-bottom: 1rem;
        background: var(--popover);
    }
</style>
