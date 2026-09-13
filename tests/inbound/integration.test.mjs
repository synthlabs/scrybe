import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path, mocks) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const code = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true,
        },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(code, {
        module,
        exports: module.exports,
        Error,
        console,
        require: (id) => {
            if (id in mocks) return mocks[id];
            throw new Error(`Unexpected ${id}`);
        },
    });
    return module.exports;
}

for (const locale of ["en", "ru"]) {
    test(`${locale}: Home actions preserve recovery copy and skip cancellation`, () => {
        const messages = JSON.parse(
            readFileSync(
                new URL(`../../messages/${locale}.json`, import.meta.url),
                "utf8",
            ),
        );
        const calls = [];
        const { showHomeActionError } = load("../../src/lib/home-errors.ts", {
            "$lib/paraglide/messages": {
                m: Object.fromEntries(
                    Object.entries(messages).map(([key, value]) => [
                        key,
                        () => value,
                    ]),
                ),
            },
            "$lib/errors": {
                notifyError: (error, presentation) =>
                    calls.push({ error, presentation }),
            },
        });
        for (const action of ["start", "stop", "new_session", "copy"]) {
            showHomeActionError(action, "private diagnostic");
            const { presentation } = calls.at(-1);
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
        const messages = JSON.parse(
            readFileSync(
                new URL(`../../messages/${locale}.json`, import.meta.url),
                "utf8",
            ),
        );
        const { ErrorController } = load(
            "../../utils/js/inbound/controller.ts",
            {},
        );
        const logs = [];
        const controller = new ErrorController({
            log: (error) => logs.push(error),
        });
        const { showSessionStartError } = load("../../src/lib/home-errors.ts", {
            "$lib/paraglide/messages": {
                m: Object.fromEntries(
                    Object.entries(messages).map(([key, value]) => [
                        key,
                        () => value,
                    ]),
                ),
            },
            "$lib/errors": {
                notifyError: (error, presentation) =>
                    controller.capture(error, presentation),
            },
        });
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
            const incident = showSessionStartError(failure);
            assert.equal(incident.source, "home.start");
            assert.equal(incident.title(), messages.home_error_start_timeout);
            assert.equal(incident.recovery(), messages[recovery]);
            assert.deepEqual(JSON.parse(incident.error.message), failure);
            assert.equal(controller.snapshot().notifications.length, 1);
            assert.equal(controller.snapshot().notifications[0].count, 1);
            controller.openReport(incident);
            assert.deepEqual(
                JSON.parse(controller.snapshot().report.error.message),
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
            const incident = showSessionStartError(failure);
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

function updater(overrides = {}) {
    const calls = [],
        errors = [],
        logs = [];
    const toast = Object.fromEntries(
        ["info", "loading", "error", "dismiss"].map((type) => [
            type,
            (message, options) => {
                calls.push({ type, message, options });
                return options?.id;
            },
        ]),
    );
    const api = load("../../utils/js/updater.ts", {
        "@tauri-apps/plugin-updater": {
            check: async () => ({
                version: "1.0",
                downloadAndInstall: async () => {
                    throw new Error("install failure");
                },
            }),
            ...overrides,
        },
        "@tauri-apps/plugin-opener": {
            openUrl: async () => {
                throw new Error("link failure");
            },
        },
        "@tauri-apps/plugin-process": { relaunch: async () => {} },
        "svelte-sonner": { toast },
        "$utils/log": {
            info() {},
            error(...args) {
                logs.push(args);
            },
        },
    });
    return {
        ...api,
        calls,
        errors,
        logs,
        onError: (error, stage) => errors.push({ error, stage }),
    };
}
const event = { preventDefault() {} };

test("updater callback owns installation errors and removes progress without a second toast or log", async () => {
    const h = updater();
    await h.checkForAppUpdates("https://example.test/releases", {
        onError: h.onError,
    });
    await h.calls
        .find((call) => call.type === "info")
        .options.action.onClick(event);
    assert.equal(h.errors.length, 1);
    assert.equal(h.errors[0].stage, "install");
    assert.equal(h.calls.filter((call) => call.type === "error").length, 0);
    assert.equal(h.logs.length, 0);
    assert.equal(h.calls.at(-1).type, "dismiss");
});

test("legacy updater consumers keep their existing failure toast", async () => {
    const h = updater();
    await h.checkForAppUpdates("https://example.test/releases");
    await h.calls
        .find((call) => call.type === "info")
        .options.action.onClick(event);
    assert.equal(h.calls.filter((call) => call.type === "error").length, 1);
    assert.equal(h.logs.length, 1);
});

test("update checking and external-link failures reach the callback", async () => {
    const failed = updater({
        check: async () => {
            throw new Error("offline");
        },
    });
    await failed.checkForAppUpdates("https://example.test", {
        onError: failed.onError,
    });
    assert.equal(failed.errors[0].stage, "check");
    assert.equal(failed.calls.length, 0);
    const external = updater();
    await external.checkForAppUpdates("https://example.test", {
        onError: external.onError,
        updateAction: {
            kind: "external",
            label: "Package manager",
            url: "https://example.test/install",
        },
    });
    await external.calls[0].options.action.onClick(event);
    assert.equal(external.errors[0].stage, "external_update");
    assert.equal(external.logs.length, 0);
});

test("release-note failures during download reach the same callback", async () => {
    const h = updater();
    await h.checkForAppUpdates("https://example.test", { onError: h.onError });
    await h.calls[0].options.action.onClick(event);
    await h.calls
        .find((call) => call.type === "loading")
        .options.action.onClick(event);
    assert.equal(h.errors.at(-1).stage, "release_notes");
});
