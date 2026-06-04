import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
    new URL("../utils/js/updater.ts", import.meta.url),
    "utf8",
);

function createEvent() {
    return {
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
    };
}

function createToastMock() {
    const calls = [];

    const push =
        (type) =>
        (message, options = {}) => {
            const call = { type, message, options };
            calls.push(call);
            return options.id ?? calls.length;
        };

    const toast = Object.assign(push("default"), {
        info: push("info"),
        loading: push("loading"),
        error: push("error"),
        dismiss: (id) => id,
    });

    return { calls, toast };
}

function loadUpdater({
    check,
    openUrl = async () => {},
    relaunch = async () => {},
    toast,
}) {
    const output = ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;

    const module = { exports: {} };
    const logger = {
        info() {},
        error() {},
    };

    const sandbox = {
        Error,
        Number,
        Promise,
        String,
        console,
        exports: module.exports,
        module,
        require(id) {
            if (id === "@tauri-apps/plugin-updater") return { check };
            if (id === "@tauri-apps/plugin-opener") return { openUrl };
            if (id === "@tauri-apps/plugin-process") return { relaunch };
            if (id === "svelte-sonner") return { toast };
            if (id === "$utils/log")
                return { __esModule: true, default: logger };
            throw new Error(`Unexpected import: ${id}`);
        },
    };

    vm.runInNewContext(output, sandbox, { filename: "updater.cjs" });
    return module.exports;
}

async function testNoUpdateShowsNoToast() {
    const { calls, toast } = createToastMock();
    const { checkForAppUpdates } = loadUpdater({
        check: async () => null,
        toast,
    });

    await checkForAppUpdates("https://example.test/releases");

    assert.equal(calls.length, 0);
}

async function testReleaseNotesAndInstallProgress() {
    const { calls, toast } = createToastMock();
    const openedUrls = [];
    let relaunched = false;
    const update = {
        version: "1.2.3",
        async downloadAndInstall(onEvent) {
            onEvent({ event: "Started", data: { contentLength: 100 } });
            onEvent({ event: "Progress", data: { chunkLength: 25 } });
            onEvent({ event: "Progress", data: { chunkLength: 25 } });
            onEvent({ event: "Finished" });
        },
    };
    const { checkForAppUpdates } = loadUpdater({
        check: async () => update,
        openUrl: async (url) => openedUrls.push(String(url)),
        relaunch: async () => {
            relaunched = true;
        },
        toast,
    });

    await checkForAppUpdates("https://example.test/releases");

    const available = calls.at(-1);
    assert.equal(available.type, "info");
    assert.equal(available.message, "Update 1.2.3 available");

    const releaseEvent = createEvent();
    await available.options.action.onClick(releaseEvent);
    assert.equal(releaseEvent.defaultPrevented, true);
    assert.deepEqual(openedUrls, ["https://example.test/releases"]);

    const installPrompt = calls.at(-1);
    assert.equal(installPrompt.type, "info");
    assert.equal(installPrompt.message, "Ready to update to 1.2.3");

    const installEvent = createEvent();
    await installPrompt.options.action.onClick(installEvent);
    assert.equal(installEvent.defaultPrevented, true);
    assert.equal(relaunched, true);
    assert.deepEqual(
        calls
            .filter((call) => call.type === "loading")
            .map((call) => call.message),
        [
            "Downloading update...",
            "Downloading update...",
            "Downloading update... 25%",
            "Downloading update... 50%",
            "Installing update...",
            "Restarting...",
        ],
    );
}

async function testInstallFailureShowsErrorToast() {
    const { calls, toast } = createToastMock();
    const update = {
        version: "1.2.3",
        async downloadAndInstall() {
            throw new Error("network unavailable");
        },
    };
    const { checkForAppUpdates } = loadUpdater({
        check: async () => update,
        toast,
    });

    await checkForAppUpdates("https://example.test/releases");
    await calls.at(-1).options.action.onClick(createEvent());
    await calls.at(-1).options.action.onClick(createEvent());

    const error = calls.at(-1);
    assert.equal(error.type, "error");
    assert.equal(error.message, "Update failed: network unavailable");
    assert.equal(error.options.duration, 6000);
}

await testNoUpdateShowsNoToast();
await testReleaseNotesAndInstallProgress();
await testInstallFailureShowsErrorToast();

console.log("updater toast tests passed");
