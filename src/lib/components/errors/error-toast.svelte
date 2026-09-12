<script lang="ts">
    import CircleAlert from "@lucide/svelte/icons/circle-alert";
    import { Button } from "$lib/components/ui/button";
    import { m as msgs } from "$lib/paraglide/messages";
    import { errors, notifyError, openErrorReport } from "$lib/errors";
    import type { ErrorNotification } from "$utils/inbound/controller";

    let { notification }: { notification: ErrorNotification } = $props();
    const resolve = (value: string | (() => string) | undefined) =>
        typeof value === "function" ? value() : value;
    const title = $derived(
        resolve(notification.title) ?? msgs.inbound_generic_title(),
    );
    const recovery = $derived(
        resolve(notification.recovery) ?? msgs.inbound_generic_recovery(),
    );
    async function recover() {
        try {
            await notification.action?.run();
        } catch (error) {
            notifyError(error, {
                source: `${notification.source}.recovery`,
                title: msgs.inbound_link_title,
                recovery: msgs.inbound_link_recovery,
            });
        }
    }
</script>

<div
    class="bg-popover text-foreground border-border w-full min-w-0 rounded-lg border p-4 text-sm shadow-lg"
    data-inbound-toast={notification.id}
    role="group"
    aria-label={title}
    onpointerenter={() => errors.pause(notification.id, "hover")}
    onpointerleave={() => errors.resume(notification.id, "hover")}
    onfocusin={() => errors.pause(notification.id, "focus")}
    onfocusout={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            errors.resume(notification.id, "focus");
    }}
>
    <div class="flex items-start gap-2" role="alert">
        <CircleAlert class="text-destructive mt-1 size-4 shrink-0" />
        <div class="min-w-0">
            <p class="font-medium">{title}</p>
            <p class="text-muted-foreground mt-1 leading-5">{recovery}</p>
            {#if notification.count > 1}<p
                    class="text-muted-foreground mt-1 text-xs"
                >
                    {msgs.inbound_repeat({ count: notification.count })}
                </p>{/if}
        </div>
    </div>
    <div class="mt-3 flex flex-wrap justify-end gap-2">
        {#if notification.action}<Button
                variant="outline"
                size="sm"
                onclick={recover}>{resolve(notification.action.label)}</Button
            >{/if}
        <Button
            variant="ghost"
            size="sm"
            onclick={() => errors.dismiss(notification.id)}
            >{msgs.inbound_dismiss()}</Button
        >
        <Button
            variant="outline"
            size="sm"
            onclick={() => openErrorReport(notification)}
            >{msgs.inbound_report()}</Button
        >
    </div>
</div>
