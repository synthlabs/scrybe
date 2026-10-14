import assert from "node:assert/strict";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
    test as base,
    type CDPSession,
    type Page,
    type TestInfo,
} from "@playwright/test";
import { tauriSources, type TauriScenario } from "./tauri";

export async function until<T>(
    check: () => T | Promise<T>,
    message: string,
    timeout = 20000,
): Promise<NonNullable<T>> {
    const deadline = Date.now() + timeout;
    let cause: unknown;
    while (Date.now() < deadline) {
        try {
            const value = await check();
            if (value) return value;
        } catch (error) {
            cause = error;
        }
        await delay(50);
    }
    throw new Error(message, { cause });
}

async function createApp(page: Page, testInfo: TestInfo, session: CDPSession) {
    const artifacts = testInfo.outputPath("measurements");
    await mkdir(artifacts, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const evaluate = <T = any>(expression: string): Promise<T> =>
        page.evaluate(expression);
    const cdp = session.send.bind(session);
    const viewport = async (width: number, height: number) =>
        page.setViewportSize({ width, height });
    const key = async (value: string) => {
        await page.keyboard.press(value === " " ? "Space" : value);
        await delay(60);
    };
    const click = async (
        selector: string,
        { hover = true, scrollWait = 100 } = {},
    ) => {
        await evaluate(
            `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`,
        );
        if (scrollWait) await delay(scrollWait);
        const point = await evaluate<{ x: number; y: number }>(
            `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const r = el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`,
        );
        if (hover) await page.mouse.move(point.x, point.y);
        await page.mouse.click(point.x, point.y);
        await delay(180);
    };
    const save = async (name: string, value: unknown) => {
        await writeFile(
            join(artifacts, name + ".json"),
            JSON.stringify(value, null, 2),
        );
    };
    return {
        page,
        cdp,
        evaluate,
        viewport,
        key,
        click,
        save,
        errors,
        artifacts,
    };
}

export type BrowserApp = Awaited<ReturnType<typeof createApp>>;
type Fixtures = { app: BrowserApp; tauriScenario: TauriScenario };

export const test = base.extend<Fixtures>({
    baseURL: async ({}, use) => {
        const port = process.env.SCRYBE_BROWSER_PORT;
        assert.match(
            port ?? "",
            /^\d+$/,
            "Browser server port was not captured",
        );
        await use(`http://127.0.0.1:${port}`);
    },
    tauriScenario: ["home", { option: true }],
    app: async ({ page, tauriScenario }, use, testInfo) => {
        await page.addInitScript({ content: tauriSources[tauriScenario] });
        const session = await page.context().newCDPSession(page);
        await session.send("Emulation.setFocusEmulationEnabled", {
            enabled: true,
        });
        const app = await createApp(page, testInfo, session);
        try {
            await use(app);
            assert.deepEqual(app.errors, [], "No uncaught frontend exceptions");
        } finally {
            if (
                testInfo.status !== testInfo.expectedStatus &&
                !page.isClosed()
            ) {
                try {
                    await app.save(
                        "failure-state",
                        await page.evaluate(`({
                        url: location.href,
                        calls: window.calls ?? window.fixtureCalls,
                        state: window.fixtureStates?.app_state?.obj,
                        editor: window.settingsModule?.settings_editor?.error,
                        bodyStyle: document.body.getAttribute("style"),
                    })`),
                    );
                } catch {}
            }
            for (const file of await readdir(app.artifacts)) {
                if (file.endsWith(".json")) {
                    await testInfo.attach(file, {
                        path: join(app.artifacts, file),
                        contentType: "application/json",
                    });
                }
            }
            await session.detach();
        }
    },
});
