import type { SessionError } from "$lib/bindings";
import { m as msgs } from "$lib/paraglide/messages";
import { notifyError } from "$lib/errors";
import type { ErrorPresentation } from "$utils/inbound/controller";

export type HomeAction = "start" | "stop" | "new_session" | "copy";

function isCancellation(error: unknown) {
    return (
        error === "Audio capture was cancelled." ||
        (error !== null &&
            typeof error === "object" &&
            "kind" in error &&
            error.kind === "cancelled")
    );
}

export function showSessionStartError(error: unknown) {
    if (isCancellation(error)) return;
    const failure = error as Partial<SessionError> | null;
    if (failure?.kind === "timeout") {
        const recovery =
            failure.phase === "waiting_for_previous_run"
                ? msgs.home_error_previous_session_recovery
                : failure.phase === "waiting_for_model"
                  ? msgs.home_error_model_busy_recovery
                  : msgs.home_error_start_timeout_recovery;
        return notifyError(error, {
            source: "home.start",
            title: msgs.home_error_start_timeout,
            recovery,
        });
    }
    return showHomeActionError("start", error);
}

export function showHomeActionError(action: HomeAction, error: unknown) {
    if (isCancellation(error)) return;
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
