import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test, until, type BrowserApp } from "../support/browser/fixtures";
test.use({ tauriScenario: "overlay" });

async function overlayChecks(app: BrowserApp) {
    const { evaluate, cdp, viewport, key, errors, artifacts } = app;

    const click = (selector: string) =>
        app.click(selector, { hover: false, scrollWait: 0 });
    const contrastReport = async (name: string) => {
        const samples = await evaluate<
            { text: string; ratio: number; required: number }[]
        >(`(() => {
            const ctx = document.createElement('canvas').getContext('2d', {willReadFrequently:true});
            const rgba = color => { ctx.clearRect(0,0,1,1); ctx.fillStyle=color; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data]; };
            const blend = (fg,bg) => fg.slice(0,3).map((channel,i) => channel*fg[3]/255+bg[i]*(1-fg[3]/255));
            const luminance = rgb => rgb.map(c => { c/=255; return c<=.04045 ? c/12.92 : ((c+.055)/1.055)**2.4; }).reduce((sum,c,i) => sum+c*[.2126,.7152,.0722][i],0);
            return [...document.querySelectorAll('body *')].flatMap(el => {
                const text = [...el.childNodes].filter(n => n.nodeType===Node.TEXT_NODE).map(n => n.textContent).join('').trim();
                const r = el.getBoundingClientRect();
                if (!text || !r.width || !r.height || r.top>=innerHeight || r.bottom<=0 || r.left>=innerWidth || el.closest('[inert], [aria-hidden="true"], :disabled, .sr-only, script, style')) return [];
                const chain=[]; for(let parent=el;parent;parent=parent.parentElement) chain.unshift(parent);
                if(chain.some(parent => +getComputedStyle(parent).opacity<1)) return [];
                const style=getComputedStyle(el);
                const bg=chain.reduce((color,parent) => blend(rgba(getComputedStyle(parent).backgroundColor),color),[255,255,255]);
                const a=luminance(blend(rgba(style.color),bg)), b=luminance(bg);
                return [{text:text.slice(0,100),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),required:parseFloat(style.fontSize)>=24 || (+style.fontWeight>=700 && parseFloat(style.fontSize)>=18.6667) ? 3 : 4.5}];
            });
        })()`);
        await writeFile(
            join(artifacts, `${name}-contrast.json`),
            JSON.stringify(samples, null, 2),
        );
        assert.deepEqual(
            samples.filter((sample) => sample.ratio < sample.required),
            [],
            name,
        );
    };
    await viewport(1300, 900);
    async function initialize() {
        await until(
            () =>
                evaluate(
                    `document.querySelector('[data-overlay-editor]') !== null`,
                ),
            "Overlay did not render",
        );
        await evaluate(`(async () => {
            window.fixtureStates = await import('/src/lib/stores/state.svelte.ts');
            window.editorModule = await import('/src/lib/stores/overlay-editor.svelte.ts');
            if (window.applied) window.fixtureStates.app_state.obj = window.applied;
            else window.applied = JSON.parse(JSON.stringify(window.fixtureStates.app_state.obj));
            for (const state of Object.values(window.fixtureStates)) state.ready = true;
            window.editorModule.overlay_test.ready = true;
        })()`);
        await delay(250);
    }

    const motion = async (
        name: string,
        reducedMotion = false,
        stress = false,
    ) => {
        await cdp("Emulation.setEmulatedMedia", {
            features: [
                {
                    name: "prefers-reduced-motion",
                    value: reducedMotion ? "reduce" : "no-preference",
                },
            ],
        });
        const result = await evaluate(`(async () => {
            const { inspectDisclosureMotion } = await import('/tests/support/browser/disclosure-motion.ts');
            return inspectDisclosureMotion({ reducedMotion: ${reducedMotion}, stress: ${stress} });
        })()`);
        await writeFile(
            join(artifacts, `${name}-motion.json`),
            JSON.stringify(result, null, 2),
        );
        assert.deepEqual(result.errors, [], name);
    };
    return { initialize, motion, contrastReport, click };
}
test("Overlay drafts, apply/discard, expiry and browser-source captions", async ({
    app,
}) => {
    const { evaluate, cdp, viewport, key, errors, artifacts } = app;

    const { initialize, motion, contrastReport, click } =
        await overlayChecks(app);
    await app.page.goto("/overlay");
    await initialize();
    await motion("initial", false, true);
    for (const open of [true, false] as const) {
        await evaluate(
            `document.getElementById('overlay-position-toggle').click()`,
        );
        await until(
            () =>
                evaluate(
                    `document.querySelector('[data-preview-frame]').getAnimations().length > 0`,
                ),
            "Preview resize did not start for surface capture",
        );
        await evaluate(`window.previewCaptureAnimations = document.getAnimations();
            window.previewCaptureAnimations.forEach(animation => animation.pause())`);
        for (const ms of [35, 125] as const) {
            await evaluate(`window.previewCaptureAnimations.forEach(animation =>
                animation.currentTime = Math.min(${ms}, Number(animation.effect.getTiming().duration)))`);
        }
        await evaluate(
            `window.previewCaptureAnimations.forEach(animation => { try { animation.finish(); } catch {} })`,
        );
        await delay(100);
    }
    await cdp("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    assert.equal(
        await evaluate(
            `document.querySelector('#overlay-position-toggle').getAttribute('aria-expanded')`,
        ),
        "false",
    );
    assert.equal(
        await evaluate(
            `document.querySelector('#overlay-styling-toggle').getAttribute('aria-expanded')`,
        ),
        "false",
    );
    assert.equal(
        await evaluate(
            `[...document.querySelectorAll('[data-overlay-editor] input')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0).length`,
        ),
        0,
    );
    assert.equal(
        await evaluate(
            `document.querySelectorAll('.basic-controls [role=slider]').length`,
        ),
        2,
    );
    assert.equal(
        await evaluate(
            `document.querySelectorAll('.anchor-grid button').length`,
        ),
        9,
    );
    const reducedSample = await evaluate(
        `document.querySelector('[data-caption]').textContent`,
    );
    await delay(450);
    assert.equal(
        await evaluate(`document.querySelector('[data-caption]').textContent`),
        reducedSample,
        "Reduced motion keeps sample text stable",
    );
    const saved = await evaluate(
        "JSON.parse(JSON.stringify(window.applied.overlay_config))",
    );
    await evaluate(
        `document.querySelector('[role=slider][aria-label="Font Size"]').focus()`,
    );
    await key("ArrowRight");
    await until(
        () => evaluate("window.editorModule.overlay_editor.dirty"),
        "Slider did not create a draft",
    );
    assert.equal(
        await evaluate(`window.applied.overlay_config.style.font_size`),
        saved.style.font_size,
    );
    assert.equal(
        await evaluate(
            `window.fixtureStates.app_state.obj.overlay_config.style.font_size`,
        ),
        saved.style.font_size,
    );
    assert.equal(
        await evaluate(
            `window.calls.filter(call => call.command === 'update_state').length`,
        ),
        0,
    );
    await click("#overlay-preset");
    await key("Home");
    await key("ArrowDown");
    await key("Enter");
    assert.equal(
        await evaluate(
            `window.editorModule.overlay_editor.config.style.background_opacity`,
        ),
        0,
    );
    assert.equal(
        await evaluate(
            `window.editorModule.overlay_editor.config.style.font_size`,
        ),
        saved.style.font_size + 1,
    );
    await click('a[href="/"]');
    await until(
        () => evaluate(`document.querySelector('#home-details-toggle')`),
        "Home navigation failed",
    );
    await click('a[href="/overlay"]');
    await until(
        () => evaluate(`document.querySelector('[data-overlay-editor]')`),
        "Overlay navigation failed",
    );
    assert.equal(
        await evaluate("window.editorModule.overlay_editor.dirty"),
        true,
    );
    await click("#overlay-setup");
    assert.equal(
        await evaluate(
            `document.querySelector('#overlay-test').textContent.trim()`,
        ),
        "Test with Changes",
    );
    await click("#overlay-test");
    assert.equal(
        await evaluate(
            `window.editorModule.overlay_test.obj.config.style.background_opacity`,
        ),
        0,
    );
    const expiry = await evaluate(
        "window.editorModule.overlay_test.obj.expires_at_ms",
    );
    await key("Escape");
    await evaluate(
        `document.querySelector('[role=slider][aria-label="Font Size"]').focus()`,
    );
    await key("ArrowRight");
    await until(
        () =>
            evaluate(
                "window.editorModule.overlay_test.obj.config.style.font_size === window.editorModule.overlay_editor.config.style.font_size",
            ),
        "Active test did not follow draft",
    );
    assert.equal(
        await evaluate("window.editorModule.overlay_test.obj.expires_at_ms"),
        expiry,
    );
    assert.deepEqual(await evaluate("window.applied.overlay_config"), saved);
    await click("#overlay-discard");
    assert.equal(
        await evaluate("window.editorModule.overlay_editor.dirty"),
        false,
    );
    assert.equal(
        await evaluate("window.editorModule.overlay_test.obj.config"),
        null,
    );
    await click("#overlay-setup");
    assert.equal(
        await evaluate(
            `document.querySelector('#overlay-test').textContent.trim()`,
        ),
        "Test",
    );
    await key("Escape");
    await evaluate(
        `document.querySelector('[role=slider][aria-label="Font Size"]').focus()`,
    );
    await key("ArrowRight");
    await evaluate(`window.fixtureFailure = 'update_state'`);
    await click("#overlay-apply");
    assert.equal(
        await evaluate("window.editorModule.overlay_editor.dirty"),
        true,
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[role=alert]').textContent.includes('Could not apply')`,
        ),
        true,
    );
    await evaluate(`window.fixtureFailure = null`);
    await click("#overlay-apply");
    assert.equal(
        await evaluate("window.editorModule.overlay_editor.dirty"),
        false,
    );
    assert.equal(
        await evaluate("window.applied.overlay_config.style.font_size"),
        saved.style.font_size + 1,
    );
    await click("#overlay-position-toggle");
    assert.equal(
        await evaluate(
            `document.querySelector('#overlay-layout-max_width') !== null`,
        ),
        true,
    );
    assert.equal(
        await evaluate(`document.querySelector('#overlay-box-h')`),
        null,
    );
    await click("#overlay-styling-toggle");
    await evaluate(
        `document.querySelector('[role=slider][aria-label="Font Size"]').focus()`,
    );
    await key("ArrowRight");
    await app.page.reload();
    await initialize();
    assert.equal(
        await evaluate("window.editorModule.overlay_editor.dirty"),
        false,
    );
    assert.equal(
        await evaluate(
            "window.editorModule.overlay_editor.config.style.font_size",
        ),
        saved.style.font_size + 1,
    );
    await viewport(1920, 1080);
    await app.page.goto("/v1/overlay");
    await until(
        () => evaluate("!!window.outputSocket?.onmessage"),
        "Output route did not connect",
    );
    await evaluate("window.outputSocket.onopen()");
    assert.deepEqual(await evaluate("window.outputRequests.map(r => r.kind)"), [
        "get_appstate",
        "get_overlay_test",
    ]);
    const send = (kind: string, data: unknown) =>
        evaluate(
            `window.outputSocket.onmessage({data:JSON.stringify({kind:${JSON.stringify(kind)},data:JSON.stringify(${JSON.stringify(data)})})})`,
        );
    const appliedState = { overlay_config: saved };
    await send("app_state_update", appliedState);
    const segment = (text: string) => ({
        id: "segment",
        index: 0,
        items: [{ text }],
    });
    const captionBounds = () =>
        evaluate(
            `document.querySelector('[data-caption]').getBoundingClientRect().toJSON()`,
        );
    await send("segment_update", segment("Hello"));
    await delay(150);
    const one = await captionBounds();
    await send("segment_update", segment("Hello to everyone watching"));
    await delay(150);
    const two = await captionBounds();
    assert.ok(two.width > one.width);
    assert.equal(two.bottom, one.bottom);
    assert.ok(
        Math.abs((two.left + two.right) / 2 - (one.left + one.right) / 2) < 1,
    );
    await send("app_state_update", {
        overlay_config: {
            ...saved,
            layout: { ...saved.layout, max_width: 300 },
        },
    });
    await send(
        "segment_update",
        segment(
            "Growing captions wrap onto multiple lines as more of the speaker’s words arrive on the stream.",
        ),
    );
    await delay(150);
    const wrapped = await captionBounds();
    assert.ok(wrapped.height > two.height);
    assert.ok(wrapped.width <= 300);
    const runtimeTest = {
        id: "output-test",
        config: {
            ...saved,
            style: {
                ...saved.style,
                background_color: "#ffffff",
                text_color: "#101114",
            },
        },
        text: "Testing draft appearance",
        started_at_ms: Date.now(),
        expires_at_ms: Date.now() + 60000,
        revision: 1,
    };
    await send("overlay_test_update", runtimeTest);
    await delay(150);
    assert.equal(
        await evaluate(
            `document.querySelector('[data-caption]').textContent.trim()`,
        ),
        "Testing draft appearance",
    );
    await send("overlay_test_update", {
        ...runtimeTest,
        expires_at_ms: Date.now() - 1,
        revision: 2,
    });
    await delay(250);
    assert.ok(
        (
            await evaluate(
                `document.querySelector('[data-caption]').textContent.trim()`,
            )
        ).startsWith("Growing captions"),
    );
    await send("overlay_test_update", runtimeTest);
    await delay(150);
    assert.ok(
        (
            await evaluate(
                `document.querySelector('[data-caption]').textContent.trim()`,
            )
        ).startsWith("Growing captions"),
        "Stale test messages must not revive an expired test",
    );
    await evaluate("window.outputSocket.onclose()");
    await delay(150);
    assert.equal(
        await evaluate(`document.querySelector('[data-caption]')`),
        null,
    );
    assert.deepEqual(errors, []);
});
for (const [locale, width, height, font, reducedMotion] of [
    ["en", 1300, 900, 16, false],
    ["ru", 880, 560, 32, false],
    ["en", 320, 560, 32, false],
    ["en", 1300, 900, 16, true],
] as const) {
    test(
        "Buttons " +
            locale +
            " " +
            width +
            "x" +
            height +
            " font " +
            font +
            " reduced " +
            reducedMotion,
        async ({ app }) => {
            const { evaluate, cdp, viewport, key, click, errors, artifacts } =
                app;

            const { initialize } = await overlayChecks(app);
            await app.page.goto("/overlay");
            await initialize();
            await viewport(width, height);
            await cdp("Emulation.setEmulatedMedia", {
                features: [
                    {
                        name: "prefers-reduced-motion",
                        value: reducedMotion ? "reduce" : "no-preference",
                    },
                ],
            });
            await evaluate(
                `localStorage.setItem('PARAGLIDE_LOCALE', ${JSON.stringify(locale)})`,
            );
            await app.page.goto("/overlay");
            await initialize();
            await evaluate(
                `document.documentElement.style.fontSize = '${font}px'`,
            );
            await delay(250);
            const result = await evaluate(`(async () => {
                const { inspectButtonMotion } = await import('/tests/support/browser/button-motion.ts');
                return inspectButtonMotion({ reducedMotion: ${reducedMotion} });
            })()`);
            const name = `buttons-${locale}-${width}-${font}-${reducedMotion}`;
            await writeFile(
                join(artifacts, `${name}.json`),
                JSON.stringify(result, null, 2),
            );
            assert.deepEqual(result.errors, [], name);
        },
    );
}
for (const [locale, width, height, font] of [
    ["en", 1300, 900, 16],
    ["en", 880, 560, 16],
    ["ru", 880, 560, 16],
    ["ru", 880, 560, 32],
    ["en", 390, 844, 16],
] as const) {
    test(
        "Overlay layout/disclosures " +
            locale +
            " " +
            width +
            "x" +
            height +
            " font " +
            font,
        async ({ app }) => {
            const { evaluate, cdp, viewport, key, errors, artifacts } = app;

            const { initialize, motion, contrastReport, click } =
                await overlayChecks(app);
            await app.page.goto("/overlay");
            await initialize();
            const appliedFont = await evaluate<number>(
                "window.applied.overlay_config.style.font_size += 1; localStorage.setItem('fixture-applied', JSON.stringify(window.applied)); window.applied.overlay_config.style.font_size",
            );
            await evaluate(
                `localStorage.setItem('PARAGLIDE_LOCALE',${JSON.stringify(locale)})`,
            );
            await app.page.reload();
            await initialize();
            assert.equal(
                await evaluate(
                    "window.fixtureStates.app_state.obj.overlay_config.style.font_size",
                ),
                appliedFont,
                "Layout cases start from the applied font size",
            );
            await viewport(width, height);
            await evaluate(
                `document.documentElement.style.fontSize = '${font}px'`,
            );
            await delay(200);
            const dimensions = await evaluate(
                `(() => { const el = document.querySelector('[data-overlay-editor]'); return {width:el.clientWidth,scroll:el.scrollWidth, body:document.body.scrollWidth, viewport:innerWidth}; })()`,
            );
            assert.ok(
                dimensions.scroll <= dimensions.width + 1 &&
                    dimensions.body <= dimensions.viewport + 1,
                JSON.stringify(dimensions),
            );
            await contrastReport(`layout-${locale}-${width}-${font}`);
            await app.save(`layout-${locale}-${width}-${font}`, dimensions);
            await motion(`${locale}-${width}-${font}`, false);
            await motion(`${locale}-${width}-${font}-reduced`, true);
            await click("#overlay-setup");
            const dialog = await evaluate(
                `(() => { const el = document.querySelector('[role=dialog]'); return {width:el.clientWidth,scroll:el.scrollWidth}; })()`,
            );
            await app.save(`setup-${locale}-${width}-${font}`, dialog);
            assert.ok(
                dialog.scroll <= dialog.width + 1,
                JSON.stringify(dialog),
            );
            await contrastReport(`setup-${locale}-${width}-${font}`);
            await key("Escape");
        },
    );
}
