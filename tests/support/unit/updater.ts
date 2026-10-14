import type { DownloadEvent } from "@tauri-apps/plugin-updater";
import type { ExternalToast } from "svelte-sonner";
import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
    check: vi.fn(),
    openUrl: vi.fn(),
    relaunch: vi.fn(),
    toast: {
        info: vi.fn(),
        loading: vi.fn(),
        error: vi.fn(),
        dismiss: vi.fn(),
    },
    logger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));
vi.mock("svelte-sonner", () => ({ toast: mocks.toast }));
vi.mock("$utils/log", () => ({ default: mocks.logger }));

import { checkForAppUpdates } from "$utils/updater";

type ToastMethod = (message: string, options?: ExternalToast) => unknown;
export type ToastCall = {
    type: string;
    message: string;
    options: ExternalToast & {
        action: {
            label: string;
            onClick: (event: MouseEvent) => void | Promise<void>;
        };
    };
};

export type UpdaterMocks = {
    check: () => Promise<{
        version: string;
        downloadAndInstall: (
            onEvent?: (event: DownloadEvent) => void,
        ) => Promise<void>;
    } | null>;
    openUrl?: (url: string) => Promise<unknown>;
    relaunch?: () => Promise<unknown>;
    toast: Record<keyof typeof mocks.toast, ToastMethod>;
    logger?: {
        info: (...args: unknown[]) => void;
        error: (...args: unknown[]) => void;
    };
};

export function useUpdater({
    check,
    openUrl = async () => {},
    relaunch = async () => {},
    toast,
    logger = { info() {}, error() {} },
}: UpdaterMocks) {
    mocks.check.mockImplementation(check);
    mocks.openUrl.mockImplementation(openUrl);
    mocks.relaunch.mockImplementation(relaunch);
    for (const method of ["info", "loading", "error", "dismiss"] as const) {
        mocks.toast[method].mockImplementation(toast[method]);
    }
    mocks.logger.info.mockImplementation(logger.info);
    mocks.logger.error.mockImplementation(logger.error);
    return { checkForAppUpdates };
}
