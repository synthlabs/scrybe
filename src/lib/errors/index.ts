import {
    ErrorController,
    type ErrorIncident,
    type ErrorPresentation,
} from "$utils/inbound/controller";
import { logHandledError } from "$utils/inbound/capture";
import { m as msgs } from "$lib/paraglide/messages";
import type { UpdateErrorStage } from "$utils/updater";

export const errors = new ErrorController({
    log: (error) => logHandledError(error.message, error.target ?? "scrybe"),
});
let returnFocus: HTMLElement | null = null;

export function openErrorReport(incident: ErrorIncident | null = null) {
    if (errors.snapshot().report) return;
    returnFocus =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
    errors.openReport(incident);
}

export function restoreReportFocus(event: Event) {
    event.preventDefault();
    const target = returnFocus?.isConnected
        ? returnFocus
        : document.querySelector<HTMLElement>('[data-sidebar="trigger"]');
    target?.focus({ preventScroll: true });
    returnFocus = null;
}

export function captureInlineError(
    error: unknown,
    source: string,
): ErrorIncident {
    return errors.capture(error, { source }, false);
}

export function notifyError(error: unknown, presentation: ErrorPresentation) {
    return errors.capture(error, presentation);
}

export function updaterError(error: unknown, stage: UpdateErrorStage) {
    const [title, recovery] =
        stage === "check"
            ? [msgs.inbound_update_check, msgs.inbound_update_check_help]
            : stage === "install"
              ? [msgs.inbound_update_install, msgs.inbound_update_install_help]
              : [msgs.inbound_link_title, msgs.inbound_link_recovery];
    notifyError(error, { source: `updater.${stage}`, title, recovery });
}
