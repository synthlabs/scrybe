import assert from "node:assert/strict";

import { setTimeout as delay } from "node:timers/promises";
import { test, until, type BrowserApp } from "../../support/browser/fixtures";
test.use({ tauriScenario: "inbound" });

import { inboundChecks } from "../../support/browser/inbound";
test("Report retries, reviewed diagnostics, inline recovery and global errors", async ({
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
    await clearNotifications();
    await evaluate(`window.fixtureFailure='start_transcribe'`);
    await click('button[aria-label="Start"]');
    await until(
        async () => (await notificationCount()) === 1,
        "Start failure missing",
    );
    await delay(500);
    assert.equal(await notificationCount(), 1);
    assert.equal(
        await evaluate(
            `window.calls.filter(c=>c.command==='plugin:log|log').at(-1).args.keyValues['inbound.handled']`,
        ),
        "true",
    );

    await contrastReport("compact-action-error");
    await reportToast();
    await evaluate(`window.fixtureFailure=undefined;`);
    await key("Tab");
    assert.equal(
        await evaluate(`!!document.activeElement.closest('[role="dialog"]')`),
        true,
        "Keyboard focus must stay in sheet",
    );
    await next();
    await evaluate(
        `const field=document.querySelector('#inbound-message');field.value='What I was doing';field.dispatchEvent(new Event('input',{bubbles:true}));`,
    );
    await evaluate(`window.fixtureFailure='plugin:inbound|preview_system'`);
    await next();
    await until(
        () => evaluate(`!!document.querySelector('[data-inbound-load-error]')`),
        "Preview failure missing",
    );
    assert.equal(
        await notificationCount(),
        0,
        "Preview failure must stay in sheet",
    );
    await evaluate(`window.fixtureFailure=undefined`);
    await click('[data-inbound-load-error] [data-inbound-action="retry"]');
    await until(
        () => evaluate(`!document.querySelector('[data-inbound-load-error]')`),
        "Preview retry failed",
    );
    await advanceTo("error");
    const selected = await evaluate(
        `window.errorModule.errors.snapshot().report.error`,
    );
    assert(selected.message.includes("Fixture failure"));
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-preview]').textContent.includes('Fixture failure')`,
        ),
        true,
    );
    await emit("100", "New error while reporting");
    await emit("101", "New error while reporting");
    await delay(200);
    assert.equal(await notificationCount(), 0, "Incoming errors should queue");
    await advanceTo("preview");
    await evaluate(`window.failSubmit=true`);
    await click('[data-inbound-action="send"]');
    await until(
        async () => (await currentStep()) === "failed",
        "Submission failure missing",
    );
    assert.equal(
        await notificationCount(),
        0,
        "Submission failure must stay in sheet",
    );
    await evaluate(`window.failSubmit=false`);
    await click('[data-inbound-action="retry"]');
    await click('[data-inbound-action="send"]');
    await until(
        async () => (await currentStep()) === "done",
        "Submission retry failed",
    );
    const submissions = await evaluate("window.submissions");
    assert.equal(submissions.length, 2);
    for (const input of submissions) {
        assert.deepEqual(input.error, selected);
        assert.equal(input.message, "What I was doing");
        assert.equal(input.include.error, true);
    }
    await click('[data-inbound-action="close"]');
    await until(
        async () => (await notificationCount()) === 1,
        "Queued errors did not resume",
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-toast]').textContent.includes('Occurred 2 times')`,
        ),
        true,
    );
    await clearNotifications();
    await emit("102", "Second reviewed error");
    await reportToast();
    await advanceTo("error");
    await click("#inbound-include-error");
    await next();
    await click('[data-inbound-action="send"]');
    await until(
        async () => (await currentStep()) === "done",
        "Report without error failed",
    );
    assert.equal(
        await evaluate("window.submissions.at(-1).include.error"),
        false,
    );
    await closeReport();
    const savedSettings = await evaluate(
        `JSON.stringify(window.fixtureStates.app_state.obj)`,
    );
    await evaluate(
        `(async()=>{window.fixtureFailure='apply_settings';window.fixtureErrorKind='model_busy';window.settingsModule.settings_editor.edit({...window.settingsModule.settings_editor.values,audio_segment_size:22});await window.settingsModule.settings_editor.apply()})()`,
    );
    assert.equal(await notificationCount(), 0);
    assert.equal(
        await evaluate(`window.settingsModule.settings_editor.busy`),
        false,
    );
    assert.equal(
        await evaluate(`window.settingsModule.settings_editor.dirty`),
        true,
    );
    assert.equal(
        await evaluate(`JSON.stringify(window.fixtureStates.app_state.obj)`),
        savedSettings,
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-settings-error]').textContent.includes('Transcription is still busy.')`,
        ),
        true,
    );
    await click("[data-settings-error] button");
    assert.equal(
        await evaluate(
            `window.errorModule.errors.snapshot().report.error.target`,
        ),
        "settings.apply",
    );
    assert.equal(
        JSON.parse(
            await evaluate(
                `window.errorModule.errors.snapshot().report.error.message`,
            ),
        ).kind,
        "model_busy",
    );
    await closeReport();
    assert.equal(
        await evaluate(
            `document.activeElement.closest('[data-settings-error]') !== null`,
        ),
        true,
        "Focus should return to inline report action",
    );
    await evaluate(
        `window.fixtureFailure=undefined;window.fixtureErrorKind=undefined;window.settingsModule.settings_editor.discard()`,
    );
    await click("#settings-report");
    assert.equal(
        await evaluate(`window.errorModule.errors.snapshot().report.error`),
        null,
    );
    await closeReport();
    assert.equal(
        await evaluate(`document.activeElement.id`),
        "settings-report",
    );
    await evaluate(
        `window.fixtureStates.internal_state.obj.runtime_dependency={status:'ready_cpu_fallback',reason:'GPU fixture',has_nvidia_gpu:true,action_url:'https://example.test/driver'}`,
    );
    await delay(300);
    assert.equal(await notificationCount(), 0);
    await evaluate(
        `window.fixtureStates.internal_state.obj.runtime_dependency={status:'unavailable',reason:'Runtime fixture',has_nvidia_gpu:true,action_url:'https://example.test/driver'}`,
    );
    await until(
        async () => (await notificationCount()) === 1,
        "Runtime error missing",
    );
    assert.equal(
        await evaluate(
            `document.querySelectorAll('[data-inbound-toast] button').length`,
        ),
        3,
    );
    await click("[data-inbound-toast] button:first-child");
    assert.equal(
        await evaluate(
            `window.calls.some(c=>c.command==='plugin:opener|open_url')`,
        ),
        true,
    );
    await clearNotifications();
    await evaluate(
        `window.dispatchEvent(new ErrorEvent('error',{message:'Global fixture',error:new Error('Global fixture')}))`,
    );
    await until(
        async () => (await notificationCount()) === 1,
        "Global exception missing",
    );
    await clearNotifications();
    await evaluate(
        `window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{promise:Promise.resolve(),reason:new Error('Rejection fixture')}))`,
    );
    await until(
        async () => (await notificationCount()) === 1,
        "Unhandled rejection missing",
    );
    await clearNotifications();

    assert.deepEqual(errors, []);
    await app.save("submissions", await evaluate("window.submissions"));
});
for (const [locale, width, height, font, reduced] of [
    ["en", 1000, 800, 16, false],
    ["ru", 640, 640, 20, false],
    ["ru", 400, 600, 20, true],
] as const) {
    test(
        "Inbound report layout " +
            locale +
            " " +
            width +
            "x" +
            height +
            " font " +
            font +
            " reduced " +
            reduced,
        async ({ app }) => {
            const { evaluate, cdp, viewport, key, click, errors, artifacts } =
                app;

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
            await evaluate(
                `localStorage.setItem('PARAGLIDE_LOCALE',${JSON.stringify(locale)})`,
            );
            await reload();
            await evaluate(
                `(async()=>{window.errorModule=await import('/src/lib/errors/index.ts');document.documentElement.style.fontSize='${font}px'})()`,
            );
            await viewport(width, height);
            await cdp("Emulation.setEmulatedMedia", {
                features: [
                    {
                        name: "prefers-reduced-motion",
                        value: reduced ? "reduce" : "no-preference",
                    },
                ],
            });
            await clearNotifications();
            await click("#settings-report");
            await next();
            await contrastReport(`${locale}-${width}-report`);
            assert.equal(
                await evaluate(
                    `document.querySelector('[role="dialog"]').scrollWidth<=document.querySelector('[role="dialog"]').clientWidth+1`,
                ),
                true,
                "Sheet must not overflow horizontally",
            );
            if (locale === "ru")
                assert.equal(
                    await evaluate(
                        `document.querySelector('[data-inbound-wizard]').textContent.includes('What happened?')`,
                    ),
                    false,
                );
            if (reduced)
                assert.equal(
                    await evaluate(
                        `parseFloat(getComputedStyle(document.querySelector('[role="dialog"]')).animationDuration)<0.01`,
                    ),
                    true,
                );
            await advanceTo("config");
            await closeReport();
        },
    );
}
