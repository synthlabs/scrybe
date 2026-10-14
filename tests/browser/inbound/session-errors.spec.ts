import assert from "node:assert/strict";

import { setTimeout as delay } from "node:timers/promises";
import { test, until, type BrowserApp } from "../../support/browser/fixtures";
test.use({ tauriScenario: "inbound" });

import { inboundChecks } from "../../support/browser/inbound";
test("Native snapshot deduplication, timeout reports, cancellation and reset fencing", async ({
    app,
}) => {
    const { evaluate, cdp, viewport, key, click, errors, artifacts } = app;

    const {
        initialize,
        reload,
        contrastReport,
        notificationCount,
        clearNotifications,
        currentStep,
        next,
        advanceTo,
        closeReport,
        reportToast,
        emit,
    } = await inboundChecks(app);
    assert.equal(
        await notificationCount(),
        1,
        "Snapshot and event must produce one notification",
    );
    assert.equal(
        await evaluate(
            `document.querySelectorAll('[data-inbound-toast] details').length`,
        ),
        0,
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-toast]').textContent.includes('Startup diagnostic')`,
        ),
        false,
    );
    await clearNotifications();

    await evaluate(
        `(async()=>{window.sessionActions=(await import('/src/lib/stores/session-actions.svelte.ts')).session_actions;window.deferStart=true})()`,
    );
    const startReady = () =>
        evaluate(
            `!window.sessionActions.pending && !document.querySelector('button[aria-label="Start"]')?.disabled`,
        );
    await click('button[aria-label="Start"]');
    await until(
        () =>
            evaluate(
                `window.starts.length===1 && !!document.querySelector('button[aria-label="Cancel"]:not(:disabled)')`,
            ),
        "Start could not be cancelled",
    );
    await click('button[aria-label="Cancel"]');
    await until(startReady, "Cancel did not release Start");
    await click('button[aria-label="Start"]');
    await until(
        () => evaluate(`window.starts.length===2`),
        "Manual retry did not start",
    );
    await evaluate(
        `window.completeStart(0,{run_id:'run-0',phase:'opening_device',kind:'timeout',details:'Stale failure'})`,
    );
    await delay(150);
    assert.equal(
        await notificationCount(),
        0,
        "A superseded attempt must not be captured",
    );
    assert.equal(await evaluate(`window.sessionActions.pending`), "start");
    const timeout = {
        run_id: "run-1",
        phase: "waiting_for_previous_run",
        kind: "timeout",
        details: "Previous worker did not finish",
    };
    await evaluate(`window.completeStart(1,${JSON.stringify(timeout)})`);
    await until(startReady, "Timeout did not release Start");
    await until(
        async () => (await notificationCount()) === 1,
        "Timeout notification missing",
    );
    await delay(250);
    assert.equal(await notificationCount(), 1, "Timeout was captured twice");
    assert.equal(
        await evaluate(
            `window.errorModule.errors.snapshot().notifications[0].count`,
        ),
        1,
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-toast]').textContent.includes('The previous session is still stopping.')`,
        ),
        true,
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-toast]').textContent.includes('Previous worker did not finish')`,
        ),
        false,
    );
    assert.equal(
        await evaluate(
            `window.calls.filter(c=>c.command==='plugin:log|log' && c.args.level===5).every(c=>c.args.keyValues?.['inbound.handled']==='true')`,
        ),
        true,
    );
    await reportToast();
    await advanceTo("error");
    assert.deepEqual(
        JSON.parse(
            await evaluate(
                `window.errorModule.errors.snapshot().report.error.message`,
            ),
        ),
        timeout,
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-preview]').textContent.includes('waiting_for_previous_run')`,
        ),
        true,
    );
    await emit(
        "session-later",
        "Later failure must not replace the selected timeout",
    );
    assert.deepEqual(
        JSON.parse(
            await evaluate(
                `window.errorModule.errors.snapshot().report.error.message`,
            ),
        ),
        timeout,
    );

    await closeReport();
    await clearNotifications();
    const errorLogsBeforeCancellation = await evaluate(
        `window.calls.filter(c=>c.command==='plugin:log|log' && c.args.level===5).length`,
    );
    await click('button[aria-label="Start"]');
    await until(
        () => evaluate(`window.starts.length===3`),
        "Cancellation fixture did not start",
    );
    await evaluate(
        `window.completeStart(2,{run_id:'run-2',phase:'opening_device',kind:'cancelled',details:'Cancelled'})`,
    );
    await until(startReady, "Cancelled result did not release Start");
    assert.equal(await notificationCount(), 0);
    assert.equal(
        await evaluate(
            `window.calls.filter(c=>c.command==='plugin:log|log' && c.args.level===5).length`,
        ),
        errorLogsBeforeCancellation,
    );
    await click('button[aria-label="Start"]');
    await until(
        () => evaluate(`window.starts.length===4`),
        "Reset fixture did not start",
    );
    await evaluate(`window.sessionActions.reset()`);
    await until(startReady, "Reset did not release Start");
    await evaluate(
        `window.completeStart(3,{run_id:'run-3',phase:'opening_device',kind:'failed',details:'Late reset failure'});window.deferStart=false`,
    );
    await delay(150);
    assert.equal(
        await notificationCount(),
        0,
        "Reset attempt emitted a stale notification",
    );
    assert.equal(
        await evaluate(`window.starts.length`),
        4,
        "New Session must remain idle",
    );

    assert.deepEqual(errors, []);
});
