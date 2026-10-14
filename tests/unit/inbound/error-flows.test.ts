import { test } from "vitest";
import assert from "node:assert/strict";
import { ErrorController } from "$utils/inbound/controller";
import { runtimeImports } from "../../support/unit/imports";
import {
    type HomePresentation,
    notifyError,
    useHomeErrors,
} from "../../support/unit/messages";

for (const locale of ["en", "ru"] as const) {
    test(`${locale}: Home actions preserve recovery copy and skip cancellation`, () => {
        const { messages, showHomeActionError } = useHomeErrors(locale);
        const calls: { error: unknown; presentation: HomePresentation }[] = [];
        notifyError.mockImplementation((error, presentation) =>
            calls.push({ error, presentation }),
        );
        for (const action of [
            "start",
            "stop",
            "new_session",
            "copy",
        ] as const) {
            showHomeActionError(action, "private diagnostic");
            const { presentation } = calls.at(-1)!;
            assert.equal(
                presentation.title(),
                messages[`home_error_${action}`],
            );
            assert.equal(
                presentation.recovery(),
                messages[`home_error_${action}_recovery`],
            );
            assert.equal(presentation.source, `home.${action}`);
        }
        showHomeActionError("start", "Audio capture was cancelled.");
        showHomeActionError("start", { kind: "cancelled", details: "Stopped" });
        assert.equal(calls.length, 4);
    });

    test(`${locale}: startup failures preserve phase recovery and report diagnostics`, () => {
        const { messages, showSessionStartError } = useHomeErrors(locale);
        const logs: unknown[] = [];
        const controller = new ErrorController({
            log: (error) => logs.push(error),
        });
        notifyError.mockImplementation((error, presentation) =>
            controller.capture(error, presentation),
        );
        const phases = {
            preparing: "home_error_start_timeout_recovery",
            waiting_for_previous_run: "home_error_previous_session_recovery",
            waiting_for_model: "home_error_model_busy_recovery",
            opening_device: "home_error_start_timeout_recovery",
            starting_stream: "home_error_start_timeout_recovery",
        };
        for (const [phase, recovery] of Object.entries(phases)) {
            const failure = {
                run_id: `run-${phase}`,
                phase,
                kind: "timeout",
                details: "Private native diagnostic",
            };
            const incident = showSessionStartError(failure)!;
            assert.equal(incident.source, "home.start");
            assert.equal(incident.title(), messages.home_error_start_timeout);
            assert.equal(incident.recovery(), messages[recovery]);
            assert.deepEqual(JSON.parse(incident.error.message), failure);
            assert.equal(controller.snapshot().notifications.length, 1);
            assert.equal(controller.snapshot().notifications[0].count, 1);
            controller.openReport(incident);
            assert.deepEqual(
                JSON.parse(controller.snapshot().report!.error!.message),
                failure,
            );
            controller.closeReport();
        }
        for (const kind of ["busy", "unavailable", "failed"]) {
            const failure = {
                run_id: `run-${kind}`,
                phase: "preparing",
                kind,
                details: "Unavailable",
            };
            const incident = showSessionStartError(failure)!;
            assert.equal(incident.title(), messages.home_error_start);
            assert.equal(
                incident.recovery(),
                messages.home_error_start_recovery,
            );
            assert.deepEqual(JSON.parse(incident.error.message), failure);
            controller.dismiss(incident.id);
        }
        const count = logs.length;
        showSessionStartError({
            run_id: "cancelled",
            phase: "opening_device",
            kind: "cancelled",
            details: "Stopped",
        });
        showSessionStartError("Audio capture was cancelled.");
        assert.equal(
            logs.length,
            count,
            "Cancellation must not enter error capture or handled error logging",
        );
        assert.equal(controller.snapshot().notifications.length, 0);
    });
}

test("Home error helpers load only the mocked runtime modules", () => {
    assert.deepEqual(runtimeImports("src/lib/home-errors.ts"), [
        "$lib/paraglide/messages",
        "$lib/errors",
    ]);
});
