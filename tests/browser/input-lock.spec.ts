import assert from "node:assert/strict";

import { setTimeout as delay } from "node:timers/promises";
import { test, until, type BrowserApp } from "../support/browser/fixtures";
test.use({ tauriScenario: "inputLock" });

function inputChecks(app: BrowserApp) {
    const { evaluate, cdp, viewport, key, errors, artifacts } = app;

    const results: unknown[] = [];
    const resize = async (width: number) => {
        await viewport(width, 900);
        await delay(300);
    };
    const click = async (selector: string) => {
        const point = await evaluate<{
            x: number;
            y: number;
            reachable: boolean;
        }>(`(() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            if (!element) throw new Error('Missing control: ' + ${JSON.stringify(selector)});
            const rect = element.getBoundingClientRect();
            const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
            return { x, y, reachable: element.contains(document.elementFromPoint(x, y)) };
        })()`);
        assert.ok(
            point.reachable,
            `${selector}: control must receive mouse input`,
        );
        const { x, y } = point;
        await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
        await cdp("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x,
            y,
            button: "left",
            buttons: 1,
            clickCount: 1,
        });
        await cdp("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x,
            y,
            button: "left",
            buttons: 0,
            clickCount: 1,
        });
        await delay(300);
    };
    const snapshot = (name: string) =>
        evaluate<{
            pointerEvents: string;
            dialogs: number;
            clicks: { trusted: boolean }[];
            mutations: { type: string; current: string | null }[];
        }>(`({
        name: ${JSON.stringify(name)}, pathname: location.pathname,
        width: innerWidth, bodyStyle: document.body.getAttribute('style'),
        pointerEvents: getComputedStyle(document.body).pointerEvents,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
        detailsOpen: window.fixtureStates.app_state.obj.home_right_rail.open,
        detailsTag: document.querySelector('#home-details')?.tagName,
        mutations: window.inputAudit.mutations, clicks: window.inputAudit.clicks
    })`);
    const unlocked = async (name: string) => {
        const state = await snapshot(name);
        results.push(state);
        assert.equal(
            state.pointerEvents,
            "auto",
            `${name}: body must accept pointer input`,
        );
        assert.equal(state.dialogs, 0, `${name}: no modal remains`);
    };
    const navigate = async (path: string) => {
        await click(`[data-sidebar="content"] a[href="${path}"]`);
        await until(
            () => evaluate(`location.pathname === ${JSON.stringify(path)}`),
            `Navigation failed: ${path}`,
        );
    };
    const setDetails = async (open: boolean) => {
        if (
            (await evaluate(
                "window.fixtureStates.app_state.obj.home_right_rail.open",
            )) !== open
        ) {
            await click("#home-details-toggle");
        }
        assert.equal(
            await evaluate(
                "window.fixtureStates.app_state.obj.home_right_rail.open",
            ),
            open,
        );
    };
    const freshHome = async (detailsOpen: boolean, sidebarOpen = true) => {
        await resize(1300);
        await app.page.goto("/");
        await until(
            () => evaluate("!!document.querySelector('#home-details-toggle')"),
            "Homepage did not render",
        );
        await evaluate(`(async () => {
            window.fixtureStates = await import('/src/lib/stores/state.svelte.ts');
            for (const state of Object.values(window.fixtureStates)) state.ready = true;
            window.fixtureStates.app_state.obj.home_right_rail.open = ${detailsOpen};
            window.fixtureStates.app_state.obj.sidebar_open = ${sidebarOpen};
            window.inputAudit = { mutations: [], clicks: [] };
            new MutationObserver(records => {
                for (const record of records) {
                    if (record.type === 'attributes' && record.target === document.body) {
                        window.inputAudit.mutations.push({ type: 'body-style', old: record.oldValue, current: document.body.getAttribute('style') });
                    }
                    for (const node of record.addedNodes) {
                        if (node instanceof Element && (node.matches('[role="dialog"]') || node.querySelector('[role="dialog"]'))) {
                            window.inputAudit.mutations.push({ type: 'dialog-added', width: innerWidth });
                        }
                    }
                }
            }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['style'] });
            window.addEventListener('click', event => window.inputAudit.clicks.push({
                trusted: event.isTrusted, target: event.target.tagName,
                control: event.target.closest('a,button')?.getAttribute('href') || event.target.closest('button')?.getAttribute('aria-label')
            }), { capture: true });
        })()`);
        await delay(300);
        await unlocked(`startup-details-${detailsOpen}-sidebar-${sidebarOpen}`);
    };

    return {
        freshHome,
        resize,
        click,
        snapshot,
        unlocked,
        navigate,
        setDetails,
        results,
    };
}
for (const detailsOpen of [false, true] as const)
    for (const sidebarOpen of [true, false] as const) {
        test(
            "Trusted navigation Details " +
                detailsOpen +
                " sidebar " +
                sidebarOpen,
            async ({ app }) => {
                const { evaluate, cdp, viewport, key, errors, artifacts } = app;

                const { freshHome, click, unlocked, navigate, results } =
                    inputChecks(app);
                await freshHome(detailsOpen, sidebarOpen);
                for (let cycle = 1; cycle <= 3; cycle++) {
                    await navigate("/overlay");
                    await unlocked(
                        `overlay-details-${detailsOpen}-sidebar-${sidebarOpen}-${cycle}`,
                    );
                    await navigate("/");
                    await unlocked(
                        `home-details-${detailsOpen}-sidebar-${sidebarOpen}-${cycle}`,
                    );
                    assert.equal(
                        await evaluate(
                            "window.fixtureStates.app_state.obj.home_right_rail.open",
                        ),
                        detailsOpen,
                    );
                    await click('[data-sidebar="trigger"]');
                    assert.equal(
                        await evaluate(
                            "window.fixtureStates.app_state.obj.sidebar_open",
                        ),
                        !sidebarOpen,
                    );
                    await click('[data-sidebar="trigger"]');
                    assert.equal(
                        await evaluate(
                            "window.fixtureStates.app_state.obj.sidebar_open",
                        ),
                        sidebarOpen,
                    );
                }
                const audit = await evaluate<{
                    clicks: { trusted: boolean }[];
                    mutations: { type: string }[];
                }>("window.inputAudit");
                assert.ok(
                    audit.clicks.length > 0 &&
                        audit.clicks.every((event) => event.trusted),
                    "Navigation uses trusted mouse input",
                );
                assert.deepEqual(
                    audit.mutations.filter(
                        (event) => event.type === "dialog-added",
                    ),
                    [],
                    "Wide navigation never mounts a modal",
                );
                await app.save("input-lock", results);
            },
        );
    }
test("Details modal cleanup across navigation, repeated resizing and keyboard input", async ({
    app,
}) => {
    const { evaluate, cdp, viewport, key, errors, artifacts } = app;

    const {
        freshHome,
        resize,
        click,
        snapshot,
        unlocked,
        navigate,
        setDetails,
        results,
    } = inputChecks(app);

    await freshHome(false);
    await resize(880);
    for (let cycle = 1; cycle <= 3; cycle++) {
        await setDetails(true);
        const modal = await snapshot(`narrow-open-${cycle}`);
        results.push(modal);
        assert.equal(modal.dialogs, 1, "Narrow Details opens as a modal");
        assert.equal(
            modal.pointerEvents,
            "none",
            "An open modal blocks the background",
        );
        await click('[aria-label="Close details"]');
        await unlocked(`narrow-closed-${cycle}`);
        assert.equal(
            await evaluate(
                "window.fixtureStates.app_state.obj.home_right_rail.open",
            ),
            false,
        );
        await navigate("/overlay");
        await navigate("/");
        await unlocked(`narrow-home-${cycle}`);
    }
    await setDetails(true);
    for (let cycle = 1; cycle <= 3; cycle++) {
        await resize(1300);
        await unlocked(`resize-wide-${cycle}`);
        assert.equal(
            await evaluate("document.querySelector('#home-details').tagName"),
            "ASIDE",
        );
        assert.equal(
            await evaluate(
                "window.fixtureStates.app_state.obj.home_right_rail.open",
            ),
            true,
        );
        await navigate("/overlay");
        await navigate("/");
        await unlocked(`resize-wide-home-${cycle}`);
        await resize(880);
        const modal = await snapshot(`resize-narrow-${cycle}`);
        results.push(modal);
        assert.equal(modal.dialogs, 1);
        assert.equal(modal.pointerEvents, "none");
    }
    await click('[aria-label="Close details"]');
    await unlocked("final-modal-close");
    assert.equal(
        await evaluate("document.activeElement.id"),
        "home-details-toggle",
        "Closing Details restores focus to its toggle",
    );
    await app.page.mouse.move(0, 0);
    for (const [key, windowsVirtualKeyCode] of [
        ["Enter", 13],
        ["Escape", 27],
    ] as const) {
        if (key === "Escape") {
            await app.page
                .locator("#home-details [data-collapsible-trigger]")
                .first()
                .focus();
            await until(
                () =>
                    evaluate(
                        "document.querySelector('[role=tooltip]') === null",
                    ),
                "Focused help did not close before the modal Escape check",
            );
        }
        for (const type of ["keyDown", "keyUp"] as const) {
            await cdp("Input.dispatchKeyEvent", {
                type,
                key,
                code: key,
                windowsVirtualKeyCode,
                ...(type === "keyDown" && key === "Enter"
                    ? { text: "\r" }
                    : {}),
            });
        }
        await delay(300);
        assert.equal(
            await evaluate(
                "document.querySelectorAll('[role=\"dialog\"]').length",
            ),
            key === "Enter" ? 1 : 0,
            `${key} ${key === "Enter" ? "opens" : "closes"} Details from the keyboard`,
        );
    }
    await unlocked("keyboard-modal-close");
    assert.equal(
        await evaluate("document.activeElement.id"),
        "home-details-toggle",
    );
    assert.deepEqual(errors, [], "No frontend exceptions");
    await app.save("input-lock", results);
});
