import { readFileSync } from "node:fs";
import { vi } from "vitest";
import type { ErrorIncident } from "$utils/inbound/controller";

export type HomePresentation = {
    source: string;
    title: () => string;
    recovery: () => string;
};
type HomeIncident = ErrorIncident & HomePresentation;

const mocks = vi.hoisted(() => ({
    messages: {} as Record<string, () => string>,
    notifyError: vi.fn(),
}));
vi.mock("$lib/paraglide/messages", () => ({ m: mocks.messages }));
vi.mock("$lib/errors", () => ({ notifyError: mocks.notifyError }));

import { showHomeActionError, showSessionStartError } from "$lib/home-errors";

export const notifyError = mocks.notifyError;

export function useHomeErrors(locale: "en" | "ru") {
    const messages: Record<string, string> = JSON.parse(
        readFileSync(
            new URL(`../../../messages/${locale}.json`, import.meta.url),
            "utf8",
        ),
    );
    for (const key of Object.keys(mocks.messages)) delete mocks.messages[key];
    for (const [key, value] of Object.entries(messages)) {
        mocks.messages[key] = () => value;
    }
    return {
        messages,
        showHomeActionError,
        showSessionStartError: showSessionStartError as (
            error: unknown,
        ) => HomeIncident | undefined,
    };
}
