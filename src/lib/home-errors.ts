import { m as msgs } from "$lib/paraglide/messages";
import { notifyError } from "$lib/errors";
import type { ErrorPresentation } from "$utils/inbound/controller";

export type HomeAction = "start" | "stop" | "new_session" | "copy";

export function showHomeActionError(action: HomeAction, error: unknown) {
    if (String(error) === "Audio capture was cancelled.") return;
    const [title, recovery] = {
        start: [msgs.home_error_start, msgs.home_error_start_recovery],
        stop: [msgs.home_error_stop, msgs.home_error_stop_recovery],
        new_session: [
            msgs.home_error_new_session,
            msgs.home_error_new_session_recovery,
        ],
        copy: [msgs.home_error_copy, msgs.home_error_copy_recovery],
    }[action];
    return notifyError(error, { source: `home.${action}`, title, recovery });
}

export function showActionError(
    title: ErrorPresentation["title"],
    recovery: ErrorPresentation["recovery"],
    error: unknown,
    source: string,
) {
    return notifyError(error, { source, title, recovery });
}
