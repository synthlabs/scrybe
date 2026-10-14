import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { until, type BrowserApp } from "./fixtures";
export async function inboundChecks(app: BrowserApp) {
    const { evaluate, cdp, viewport, key, click, errors, artifacts } = app;

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
    await evaluate(
        `document.body.innerHTML='<button id="keyboard-check">Check</button>';window.keyboardClicks=0;document.querySelector('button').onclick=()=>window.keyboardClicks++;document.querySelector('button').focus()`,
    );
    await key("Enter");
    await key(" ");
    assert.equal(
        await evaluate("window.keyboardClicks"),
        2,
        "Keyboard fixture did not activate a native button",
    );
    await viewport(1300, 900);
    async function initialize() {
        await until(
            () =>
                evaluate(
                    `document.querySelector('[data-settings-editor]') !== null`,
                ),
            "Settings did not render",
        );
        await evaluate(`(async()=>{
            window.fixtureStates=await import('/src/lib/stores/state.svelte.ts');
            window.settingsModule=await import('/src/lib/stores/settings-editor.svelte.ts');
            if(window.applied) window.fixtureStates.app_state.obj=window.applied;
            else window.fixtureStates.app_state.obj.model_path='/models/ggml-base-q8_0.bin';
            for(const state of Object.values(window.fixtureStates)) state.ready=true;
        })()`);
        await delay(250);
    }
    async function reload() {
        const previous = await evaluate("window.fixtureBoot");
        await app.page.reload();
        await until(async () => {
            const boot = await evaluate("window.fixtureBoot");
            return typeof boot === "number" && boot !== previous;
        }, "Page did not reload");
        await initialize();
    }

    await app.page.goto("/settings");
    await initialize();
    await evaluate(
        "(async()=>{window.errorModule=await import('/src/lib/errors/index.ts')})()",
    );
    const notificationCount = () =>
        evaluate(`document.querySelectorAll('[data-inbound-toast]').length`);
    const clearNotifications = async () => {
        await evaluate(
            `window.errorModule.errors.snapshot().notifications.forEach(n=>window.errorModule.errors.dismiss(n.id))`,
        );
        await until(
            async () => (await notificationCount()) === 0,
            "Notifications did not close",
        );
    };
    const currentStep = () =>
        evaluate(
            `document.querySelector('[data-inbound-wizard]')?.dataset.step`,
        );
    const next = async () => {
        await until(
            () =>
                evaluate(
                    `!!document.querySelector('[data-inbound-action="next"]:not(:disabled)')`,
                ),
            "Next did not become available",
        );
        await click('[data-inbound-action="next"]');
    };
    const advanceTo = async (step: string) => {
        for (let i = 0; i < 10 && (await currentStep()) !== step; i++)
            await next();
        assert.equal(await currentStep(), step);
    };
    const closeReport = async () => {
        await key("Escape");
        await until(
            () => evaluate(`!document.querySelector('[data-inbound-wizard]')`),
            "Report did not close",
        );
        await delay(250);
    };
    const reportToast = async () => {
        await until(
            () => evaluate(`!!document.querySelector('[data-inbound-toast]')`),
            "Error toast missing",
        );
        await click("[data-inbound-toast] button:last-child");
        await until(
            () => evaluate(`!!document.querySelector('[data-inbound-wizard]')`),
            "Report sheet missing",
        );
    };
    const emit = async (id: string, message: string) =>
        evaluate(
            `window.sendFixtureEvent('inbound://error-captured',${JSON.stringify({ id, error: { kind: "error", message, target: "native", timestamp: "1" } })})`,
        );

    return {
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
    };
}
