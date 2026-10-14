import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test, until, type BrowserApp } from "../support/browser/fixtures";
test.use({ tauriScenario: "session" });

test("Cancellation, stale completions, retries, session resets and overlay isolation", async ({
    app,
}) => {
    const { evaluate, cdp, viewport, key, errors, artifacts } = app;

    const click = (label: string) =>
        evaluate(
            `Array.from(document.querySelectorAll('button')).find(button => (button.getAttribute('aria-label') || button.textContent.trim()) === ${JSON.stringify(label)}).click()`,
        );
    const ready = () =>
        evaluate(
            `!window.actions.pending && !document.querySelector('button[aria-label="Start"]').disabled`,
        );
    await cdp("Emulation.setDeviceMetricsOverride", {
        width: 1300,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
    });
    await app.page.goto("/");
    await until(
        () => evaluate(`!!document.querySelector('#home-details-toggle')`),
        "Home did not render",
    );
    await evaluate(`(async () => {
        window.states = await import('/src/lib/stores/state.svelte.ts');
        window.session = (await import('/src/lib/stores/session.svelte.ts')).session;
        window.actions = (await import('/src/lib/stores/session-actions.svelte.ts')).session_actions;
        window.defaults = await import('/src/lib/defaults.ts');
        for (const state of Object.values(window.states)) state.ready = true;
    })()`);
    await click("Start");
    await until(
        () =>
            evaluate(
                `window.actions.starting && !!document.querySelector('button[aria-label="Cancel"]')`,
            ),
        "Cancel unavailable during startup",
    );
    assert.equal(
        await evaluate(
            `document.querySelector('button[aria-label="Cancel"]').disabled`,
        ),
        false,
    );

    await click("Cancel");
    await until(ready, "Cancel did not release controls", 2000);
    await click("Start");
    await evaluate(
        `window.completeStart(0, { kind: 'timeout', phase: 'opening_device', run_id: 'run-0', details: 'late failure' })`,
    );
    assert.equal(await evaluate(`window.actions.pending`), "start");
    assert.equal(
        await evaluate(
            `document.querySelectorAll('[data-sonner-toast]').length`,
        ),
        0,
    );
    await evaluate(
        `window.completeStart(1, { kind: 'timeout', phase: 'opening_device', run_id: 'run-1', details: 'fixture audio timeout' })`,
    );
    await until(ready, "Timeout did not release controls", 2000);
    await until(
        () =>
            evaluate(
                `document.body.textContent.includes('Captions did not start within 5 seconds.')`,
            ),
        "Timeout message missing",
    );
    assert.equal(
        await evaluate(
            `document.querySelectorAll('[data-sonner-toast]').length`,
        ),
        1,
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-toast] details')`,
        ),
        null,
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-toast]').textContent.includes('fixture audio timeout')`,
        ),
        false,
    );

    await click("Dismiss");
    await click("Start");
    await evaluate(`window.completeStart(2)`);
    await until(
        () =>
            evaluate(
                `!window.actions.pending && !!document.querySelector('button[aria-label="Stop"]')`,
            ),
        "Successful start did not show Stop",
    );
    await evaluate(
        `window.session.add_segment({ id: 'caption', index: 0, items: [{ index: 0, start_time: 0, end_time: 100, text: 'Test caption', detected_language: 'en' }] }); window.session.mark_started(); window.states.audio_metrics.obj.input_rms = 0.6; window.states.audio_metrics.obj.inference_sample_count = 20; window.states.gate_telemetry.obj.entries = [{ sequence: 1, segment_id: 'caption', candidate_words: 2, last_emitted_words: 0, decision: 'Emit', suppression_reason: null, evaluate_ms: 1 }];`,
    );
    const configBefore = await evaluate(
        `JSON.stringify(window.states.app_state.obj)`,
    );
    const startsBefore = await evaluate(`window.starts.length`);
    await click("New Session");
    await until(ready, "New Session did not become ready", 2000);
    assert.equal(await evaluate(`window.starts.length`), startsBefore);
    assert.deepEqual(
        await evaluate(
            `({ count: window.session.segments.length, words: window.session.word_count, started: window.session.started_at, rms: window.states.audio_metrics.obj.input_rms, inference: window.states.audio_metrics.obj.inference_sample_count, checks: window.states.gate_telemetry.obj.entries.length })`,
        ),
        { count: 0, words: 0, started: null, rms: 0, inference: 0, checks: 0 },
    );
    assert.equal(
        await evaluate(`JSON.stringify(window.states.app_state.obj)`),
        configBefore,
    );

    await click("Start");
    await click("New Session");
    await until(ready, "Reset of pending start did not finish", 2000);
    await evaluate(
        `window.completeStart(3, { kind: 'cancelled', phase: 'opening_device', run_id: 'run-3', details: 'cancelled' })`,
    );
    assert.equal(await evaluate(`window.starts.length`), startsBefore + 1);
    await click("New Session");
    await until(ready, "Idle reset did not finish", 2000);
    await evaluate(
        `window.session.add_segment({ id: 'new-caption', index: 0, items: [{ index: 0, start_time: 0, end_time: 100, text: 'Current', detected_language: 'en' }] }); window.fire('session_reset', { revision: window.resetRevision });`,
    );
    assert.equal(
        await evaluate(`window.session.segments.length`),
        1,
        "Duplicate reset erased new data",
    );
    await until(
        () =>
            evaluate(
                `document.querySelectorAll('[data-sonner-toast]').length === 0`,
            ),
        "Cancelled start displayed an error",
    );
    await app.page.addInitScript({
        content: `
        const NativeWebSocket = window.WebSocket;
        window.WebSocket = class extends NativeWebSocket {
            constructor(url) {
                if (url !== 'ws://localhost:3030/ws') { super(url); return; }
                const socket = { send() {}, close() {} };
                window.overlaySocket = socket;
                setTimeout(() => socket.onopen?.(), 0);
                return socket;
            }
        };
    `,
    });
    await app.page.goto("/v1/overlay/");
    await until(
        () => evaluate(`!!window.overlaySocket?.onmessage`),
        "Overlay did not connect",
    );
    await evaluate(
        `window.overlaySocket.onmessage({ data: JSON.stringify({ kind: 'segment_update', data: JSON.stringify({ id: 'live', index: 0, items: [{ index: 0, start_time: 0, end_time: 100, text: 'Live caption', detected_language: 'en' }] }) }) })`,
    );
    await until(
        () =>
            evaluate(
                `document.querySelector('canvas')?.getBoundingClientRect().width > 1`,
            ),
        "Overlay caption did not render",
    );
    await evaluate(
        `window.overlaySocket.onmessage({ data: JSON.stringify({ kind: 'session_reset', data: '{"revision":1}' }) })`,
    );
    await until(
        () =>
            evaluate(
                `!document.querySelector('canvas') || document.querySelector('canvas').getBoundingClientRect().width <= 1`,
            ),
        "Reset did not clear overlay caption",
    );
    await evaluate(
        `(async () => { const { DefaultAppState } = await import('/src/lib/defaults.ts'); const started = Date.now(); window.overlaySocket.onmessage({ data: JSON.stringify({ kind: 'overlay_test_update', data: JSON.stringify({ id: 'test', config: DefaultAppState.overlay_config, text: 'Overlay test', started_at_ms: started, expires_at_ms: started + 60000, revision: 1 }) }) }); })()`,
    );
    await until(
        () =>
            evaluate(
                `document.querySelector('canvas')?.getBoundingClientRect().width > 1`,
            ),
        "Overlay test did not render",
    );
    await evaluate(
        `window.overlaySocket.onmessage({ data: JSON.stringify({ kind: 'session_reset', data: '{"revision":2}' }) })`,
    );
    assert.equal(
        await evaluate(
            `document.querySelector('canvas').getBoundingClientRect().width > 1`,
        ),
        true,
        "Reset cleared the separate overlay test",
    );
    assert.deepEqual(errors, []);
    await writeFile(
        join(artifacts, "result.json"),
        JSON.stringify(
            {
                passed: true,
                checks: [
                    "cancellable starting UI",
                    "stale completion fencing",
                    "one localized timeout",
                    "manual retry",
                    "reset from running/starting/idle without Start",
                    "all stats clear",
                    "configuration preservation",
                    "duplicate reset protection",
                    "live overlay clears",
                    "overlay test preserved",
                ],
            },
            null,
            2,
        ),
    );
});
