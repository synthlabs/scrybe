import { test } from "vitest";
import assert from "node:assert/strict";
import type { ExternalToast } from "svelte-sonner";
import type { UpdateErrorStage } from "$utils/updater";
import {
    type ToastCall,
    type UpdaterMocks,
    useUpdater,
} from "../../support/unit/updater";

function updater(overrides: Partial<Pick<UpdaterMocks, "check">> = {}) {
    const calls: ToastCall[] = [];
    const errors: { error: unknown; stage: UpdateErrorStage }[] = [];
    const logs: unknown[][] = [];
    const toast = Object.fromEntries(
        ["info", "loading", "error", "dismiss"].map((type) => [
            type,
            (message: string, options?: ExternalToast) => {
                calls.push({
                    type,
                    message,
                    options: options as ToastCall["options"],
                });
                return options?.id;
            },
        ]),
    ) as UpdaterMocks["toast"];
    const api = useUpdater({
        check:
            overrides.check ??
            (async () => ({
                version: "1.0",
                downloadAndInstall: async () => {
                    throw new Error("install failure");
                },
            })),
        openUrl: async () => {
            throw new Error("link failure");
        },
        relaunch: async () => {},
        toast,
        logger: {
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
        onError: (error: unknown, stage: UpdateErrorStage) =>
            errors.push({ error, stage }),
    };
}
const event = { preventDefault() {} } as MouseEvent;

test("updater callback owns installation errors and removes progress without a second toast or log", async () => {
    const h = updater();
    await h.checkForAppUpdates("https://example.test/releases", {
        onError: h.onError,
    });
    await h.calls
        .find((call) => call.type === "info")!
        .options.action.onClick(event);
    assert.equal(h.errors.length, 1);
    assert.equal(h.errors[0].stage, "install");
    assert.equal(h.calls.filter((call) => call.type === "error").length, 0);
    assert.equal(h.logs.length, 0);
    assert.equal(h.calls.at(-1)!.type, "dismiss");
});

test("legacy updater consumers keep their existing failure toast", async () => {
    const h = updater();
    await h.checkForAppUpdates("https://example.test/releases");
    await h.calls
        .find((call) => call.type === "info")!
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
        .find((call) => call.type === "loading")!
        .options.action.onClick(event);
    assert.equal(h.errors.at(-1)!.stage, "release_notes");
});
