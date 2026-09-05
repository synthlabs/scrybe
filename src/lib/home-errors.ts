import { toast } from "svelte-sonner";
import { m as msgs } from "$lib/paraglide/messages";
import ActionError from "$lib/components/home/action-error.svelte";
import type { ComponentProps, ComponentType } from "svelte";

export type HomeAction = "start" | "stop" | "new_session" | "copy";

export function showHomeActionError(action: HomeAction, error: unknown) {
    const copy = {
        start: [msgs.home_error_start, msgs.home_error_start_recovery],
        stop: [msgs.home_error_stop, msgs.home_error_stop_recovery],
        new_session: [
            msgs.home_error_new_session,
            msgs.home_error_new_session_recovery,
        ],
        copy: [msgs.home_error_copy, msgs.home_error_copy_recovery],
    }[action];
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cancelTimeout = () => {
        clearTimeout(timeout);
        timeout = undefined;
    };
    // Sonner 0.3's component type still describes Svelte 4 constructors.
    const id = toast.custom(ActionError as unknown as ComponentType, {
        duration: Infinity,
        onDismiss: cancelTimeout,
        componentProps: {
            title: copy[0](),
            recovery: copy[1](),
            details: error instanceof Error ? error.message : String(error),
            onExpand: cancelTimeout,
            onDismiss: () => {
                cancelTimeout();
                toast.dismiss(id);
            },
        } satisfies ComponentProps<typeof ActionError>,
    });
    timeout = setTimeout(() => toast.dismiss(id), 10000);
    return id;
}
