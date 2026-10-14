import assert from "node:assert/strict";
import { test } from "vitest";
import type { DownloadEvent } from "@tauri-apps/plugin-updater";
import type { ExternalToast } from "svelte-sonner";
import { runtimeImports } from "../support/unit/imports";
import {
    type ToastCall,
    useUpdater as loadUpdater,
} from "../support/unit/updater";

function createEvent() {
    const event = {
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
    };
    return event as MouseEvent;
}

function createToastMock() {
    const calls: ToastCall[] = [];

    const push =
        (type: string) =>
        (message: string, options: ExternalToast = {}) => {
            const call = {
                type,
                message,
                options: options as ToastCall["options"],
            };
            calls.push(call);
            return options.id ?? calls.length;
        };

    const toast = Object.assign(push("default"), {
        info: push("info"),
        loading: push("loading"),
        error: push("error"),
        dismiss: (id: string | number) => id,
    });

    return { calls, toast };
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
    const openedUrls: string[] = [];
    let relaunched = false;
    const update = {
        version: "1.2.3",
        async downloadAndInstall(onEvent?: (event: DownloadEvent) => void) {
            onEvent!({ event: "Started", data: { contentLength: 100 } });
            onEvent!({ event: "Progress", data: { chunkLength: 25 } });
            onEvent!({ event: "Progress", data: { chunkLength: 25 } });
            onEvent!({ event: "Finished" });
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

    const available = calls.at(-1)!;
    assert.equal(available.type, "info");
    assert.equal(available.message, "Update 1.2.3 available");

    const installEvent = createEvent();
    await available.options.action.onClick(installEvent);
    assert.equal(installEvent.defaultPrevented, true);
    assert.equal(relaunched, true);
    assert.deepEqual(openedUrls, []);

    const downloading = calls.find((call) => call.type === "loading")!;
    const releaseEvent = createEvent();
    await downloading.options.action.onClick(releaseEvent);
    assert.equal(releaseEvent.defaultPrevented, true);
    assert.deepEqual(openedUrls, ["https://example.test/releases"]);
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
    await calls.at(-1)!.options.action.onClick(createEvent());

    const error = calls.at(-1)!;
    assert.equal(error.type, "error");
    assert.equal(error.message, "Update failed: network unavailable");
    assert.equal(error.options.duration, 6000);
}

async function testPackageManagerActionOpensInstructions() {
    const { calls, toast } = createToastMock();
    const openedUrls: string[] = [];
    const { checkForAppUpdates } = loadUpdater({
        check: async () => ({
            version: "1.2.3",
            downloadAndInstall() {
                assert.fail("Package-manager updates must not install in-app");
            },
        }),
        openUrl: async (url) => openedUrls.push(String(url)),
        relaunch: async () => assert.fail("External updates must not restart"),
        toast,
    });
    const url = "https://github.com/synthlabs/scrybe#arch-linux-and-cachyos";

    await checkForAppUpdates("https://example.test/releases", {
        updateAction: {
            kind: "external",
            label: "Update via package manager",
            url,
        },
    });

    assert.equal(calls[0].options.action.label, "Update via package manager");
    const event = createEvent();
    await calls[0].options.action.onClick(event);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(openedUrls, [url]);
    assert.equal(calls.length, 1);
}

test("no update shows no toast", testNoUpdateShowsNoToast);
test(
    "release notes and installation progress retain their actions",
    testReleaseNotesAndInstallProgress,
);
test(
    "installation failures show the existing error toast",
    testInstallFailureShowsErrorToast,
);
test(
    "package manager actions open instructions without installing or restarting",
    testPackageManagerActionOpensInstructions,
);
test("updater loads only the mocked runtime modules", () => {
    assert.deepEqual(runtimeImports("utils/js/updater.ts"), [
        "@tauri-apps/plugin-updater",
        "@tauri-apps/plugin-opener",
        "@tauri-apps/plugin-process",
        "svelte-sonner",
        "$utils/log",
    ]);
});
