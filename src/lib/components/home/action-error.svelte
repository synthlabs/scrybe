<script lang="ts">
    import CircleAlert from "@lucide/svelte/icons/circle-alert";
    import { Button } from "$lib/components/ui/button/index.ts";
    import { m as msgs } from "$lib/paraglide/messages";

    let {
        title,
        recovery,
        details,
        onExpand,
        onDismiss,
    }: {
        title: string;
        recovery: string;
        details: string;
        onExpand: () => void;
        onDismiss: () => void;
    } = $props();
</script>

<div
    class="bg-popover text-foreground border-border w-full min-w-0 rounded-lg border p-4 text-sm shadow-lg"
>
    <div class="flex items-start gap-2" role="alert">
        <CircleAlert class="text-destructive mt-1 size-4 shrink-0" />
        <div class="min-w-0">
            <p class="font-medium">{title}</p>
            <p class="text-muted-foreground mt-1 leading-5">{recovery}</p>
        </div>
    </div>
    <details
        class="mt-3"
        ontoggle={(event) => {
            if (event.currentTarget.open) onExpand();
        }}
    >
        <summary
            class="focus-visible:ring-ring focus-visible:ring-offset-popover min-h-8 cursor-pointer rounded-md px-2 py-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
            {msgs.home_error_technical_details()}
        </summary>
        <pre
            class="bg-background mt-2 max-h-48 overflow-auto rounded-lg p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap">{details}</pre>
    </details>
    <div class="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" onclick={onDismiss}
            >{msgs.home_error_dismiss()}</Button
        >
    </div>
</div>
