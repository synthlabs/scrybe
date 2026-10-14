import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test, until, type BrowserApp } from "../support/browser/fixtures";
test.use({ tauriScenario: "settings" });

async function settingsChecks(app: BrowserApp) {
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
    const input = async (value: string) => {
        await evaluate(
            `(()=>{const field=document.querySelector('#settings-search');field.value=${JSON.stringify(value)};field.dispatchEvent(new Event('input',{bubbles:true}));})()`,
        );
        await delay(250);
    };
    const editor = (expression: string) =>
        evaluate(`window.settingsModule.settings_editor.${expression}`);
    const navigate = async (path: string) => {
        await evaluate(`document.querySelector('a[href="${path}"]').click()`);
        await until(
            async () =>
                await evaluate(
                    `location.pathname === ${JSON.stringify(path)} && Boolean(document.querySelector('a[href="/settings"]'))`,
                ),
            "Navigation did not finish: " + path,
        );
    };
    const applied = (expression: string) =>
        evaluate(`window.fixtureStates.app_state.obj.${expression}`);
    const clickControl = async (selector: string) => {
        await evaluate(
            `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`,
        );
        await click(selector);
    };
    const layoutCheck = async (name: string) => {
        const report = await evaluate(
            `({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,footer:document.querySelector('footer').getBoundingClientRect().toJSON(),footerPosition:getComputedStyle(document.querySelector('footer')).position,editorWidth:document.querySelector('[data-settings-editor]').clientWidth,editorScrollWidth:document.querySelector('[data-settings-editor]').scrollWidth})`,
        );
        assert(
            report.scrollWidth <= report.width + 1,
            name + " document overflow",
        );
        assert(report.bodyWidth <= report.width + 1, name + " body overflow");
        assert(
            report.editorScrollWidth <= report.editorWidth + 1,
            name + " Settings content overflow: " + JSON.stringify(report),
        );
        assert(
            report.footerPosition !== "sticky" ||
                report.footer.height < 0.4 * (await evaluate("innerHeight")),
            name + " sticky footer obscures content",
        );
        assert(
            report.footer.left >= -1 && report.footer.right <= report.width + 1,
            name + " footer overflow",
        );
        await app.save(name, report);
    };

    return {
        initialize,
        reload,
        input,
        editor,
        navigate,
        applied,
        clickControl,
        layoutCheck,
        contrastReport,
    };
}
test("Settings defaults, drafts, models, audio devices and recovery", async ({
    app,
}) => {
    const { evaluate, cdp, viewport, key, click, errors, artifacts } = app;

    const {
        initialize,
        reload,
        input,
        editor,
        navigate,
        applied,
        clickControl,
        layoutCheck,
        contrastReport,
    } = await settingsChecks(app);
    await app.page.goto("/settings");
    await initialize();
    assert.equal(await editor("dirty"), false);
    assert.equal(
        await evaluate(`document.querySelector('#settings-apply').disabled`),
        true,
    );
    assert.equal(
        await evaluate(
            `document.querySelector('#settings-model-advanced').getAttribute('aria-expanded')`,
        ),
        "false",
    );
    assert.equal(
        await evaluate(
            `document.querySelector('#settings-audio-advanced').getAttribute('aria-expanded')`,
        ),
        "false",
    );
    assert.equal(
        await evaluate(
            `document.querySelector('#token_timestamps')?.getBoundingClientRect().height ?? 0`,
        ),
        0,
    );
    assert.equal(await evaluate(`document.querySelector('#translate')`), null);

    await contrastReport("default");
    await layoutCheck("default");

    await input("token_timestamps");
    assert(await evaluate(`!!document.querySelector('#token_timestamps')`));
    assert.equal(
        await evaluate(
            `document.querySelectorAll('[data-settings-control]').length`,
        ),
        1,
    );
    await clickControl("#token_timestamps");
    assert.equal(
        await editor("values.whisper_params.toggles.token_timestamps"),
        false,
    );
    assert.equal(
        await applied("whisper_params.toggles.token_timestamps"),
        true,
    );
    await input("no-such-setting-xyz");
    assert(
        await evaluate(
            `!!document.querySelector('[data-settings-no-results]')`,
        ),
    );
    await input("");
    assert.equal(
        await evaluate(
            `document.querySelector('#settings-model-advanced').getAttribute('aria-expanded')`,
        ),
        "false",
    );
    await navigate("/overlay");
    await navigate("/settings");
    assert.equal(
        await editor("values.whisper_params.toggles.token_timestamps"),
        false,
    );
    await clickControl("#settings-discard");
    assert.equal(await editor("dirty"), false);
    await clickControl("#settings-model-advanced");
    await clickControl("#hallucination-protection");
    assert.equal(
        await evaluate(
            `[...document.querySelectorAll('[data-settings-control="vad-sensitivity"] button')].every(button=>button.disabled)`,
        ),
        true,
    );
    await clickControl("#settings-discard");
    await editor(
        "edit({...window.settingsModule.settings_editor.values,audio_segment_size:31})",
    );
    await evaluate(
        `window.fixtureStates.internal_state.obj.transcribe_running=true`,
    );
    assert.equal(await editor("requires_stop"), false);
    await clickControl("#settings-apply");
    await until(() => editor("busy === false"), "Apply did not finish");
    assert.equal(await applied("audio_segment_size"), 31);
    await editor(
        'edit({...window.settingsModule.settings_editor.values,current_device:{id:"mic-0",name:"Studio Microphone"}})',
    );
    assert.equal(await editor("requires_stop"), true);
    assert.equal(
        await evaluate(`document.querySelector('#settings-apply').disabled`),
        true,
    );
    await evaluate(
        `window.fixtureStates.internal_state.obj.transcribe_running=false`,
    );
    await clickControl("#settings-discard");
    await navigate("/overlay");
    await evaluate(`window.fixtureFailure='list_model_presets'`);
    await navigate("/settings");
    await evaluate(`document.querySelector('#settings-change-model').focus()`);
    await key("Enter");
    await until(
        () =>
            evaluate(
                `document.querySelector('#settings-change-model').getAttribute('aria-expanded') === 'true' && !!document.querySelector('#settings-model-choices [role="alert"]')`,
            ),
        "Keyboard open did not reveal the model-list error",
    );
    await evaluate(`window.fixtureFailure=null;window.deferModels=true`);
    await clickControl("#settings-model-choices button");
    await until(
        () =>
            evaluate(
                `typeof window.finishModels === 'function' && !!document.querySelector('#settings-model-choices [role="status"]')`,
            ),
        "Model retry did not show its loading state",
    );
    await evaluate(`window.deferModels=false;window.finishModels()`);
    await until(
        () =>
            evaluate(
                `document.querySelectorAll('#settings-model-choices input[type="radio"]').length === 6 && !document.querySelector('#settings-model-choices [role="status"], #settings-model-choices [role="alert"]')`,
            ),
        "Model retry did not restore the choices",
    );
    await evaluate(`document.querySelector('#settings-change-model').focus()`);
    await key("Enter");
    await until(
        () =>
            evaluate(
                `document.querySelector('#settings-model-choices').hidden && document.activeElement.id === 'settings-change-model'`,
            ),
        "Keyboard close did not hide the model list and retain focus",
    );
    await key(" ");
    await until(
        () =>
            evaluate(
                `document.querySelector('#settings-change-model').getAttribute('aria-expanded') === 'true' && !document.querySelector('#settings-model-choices').hidden`,
            ),
        "Space did not reopen the model list",
    );
    await clickControl('input[value="tiny-q8_0"]');
    assert.equal(await editor("model.id"), "tiny-q8_0");
    await evaluate(
        `document.querySelector('#settings-model-choices input:checked').focus()`,
    );
    const modelFocus = await evaluate(`(()=>{
            const list=document.querySelector('#settings-model-choices');
            const card=list.querySelector('input:checked').closest('label');
            const a=list.getBoundingClientRect(), b=card.getBoundingClientRect();
            return {overflow:getComputedStyle(list).overflow, shadow:getComputedStyle(card).boxShadow, left:b.left-a.left, right:a.right-b.right};
        })()`);
    await app.save("model-card-focus", modelFocus);
    assert(
        modelFocus.overflow === "visible" ||
            Math.min(modelFocus.left, modelFocus.right) >= 4,
        "Model card focus ring is clipped: " + JSON.stringify(modelFocus),
    );
    assert.equal(await applied("model_path"), "/models/ggml-base-q8_0.bin");
    assert.equal(
        await evaluate(
            `window.calls.filter(c=>c.command==='download_model_preset').length`,
        ),
        0,
    );
    await editor(
        "edit({...window.settingsModule.settings_editor.values,audio_segment_size:22})",
    );
    await evaluate(`window.fixtureFailure='apply_settings'`);
    await clickControl("#settings-apply");
    await until(() => editor("busy === false"), "Failed apply did not finish");
    assert.equal(await editor("dirty"), true);
    assert.equal(await applied("audio_segment_size"), 31);
    assert.equal(await applied("model_path"), "/models/ggml-base-q8_0.bin");
    assert(await evaluate(`!!document.querySelector('[data-settings-error]')`));
    await evaluate(`window.fixtureFailure=null;window.deferApply=true`);
    await clickControl("#settings-apply");
    await until(
        () => evaluate('typeof window.finishApply === "function"'),
        "Apply did not defer",
    );
    assert.equal(
        await evaluate(`document.querySelector('#settings-discard').disabled`),
        true,
    );
    assert.equal(
        await evaluate(
            `document.querySelector('header button[aria-label="Start"]').disabled`,
        ),
        true,
    );
    await evaluate(
        `window.fixtureStates.app_state.obj.sidebar_open=false; window.fixtureStates.app_state.obj.overlay_config.style.font_size=77;window.finishApply();window.deferApply=false`,
    );
    await until(() => editor("busy === false"), "Apply did not finish");
    assert.equal(await applied("model_path"), "/models/ggml-tiny-q8_0.bin");
    assert.equal(await applied("audio_segment_size"), 22);
    assert.equal(await applied("overlay_config.style.font_size"), 77);
    assert.equal(await editor("dirty"), false);
    await editor(
        'edit({...window.settingsModule.settings_editor.values,current_device:{id:"mic-0",name:"Studio Microphone"},audio_segment_size:48})',
    );
    await editor('chooseModel({kind:"file",path:"/models/custom.bin"})');
    await clickControl("#settings-reset");
    assert.equal(await editor("values.current_device.id"), "mic-0");
    assert.equal(await editor("model.path"), "/models/custom.bin");
    assert.equal(await editor("values.audio_segment_size"), 15);
    await clickControl("#settings-discard");
    await editor(
        "edit({...window.settingsModule.settings_editor.values,audio_segment_size:42})",
    );
    await reload();
    assert.equal(await editor("values.audio_segment_size"), 22);
    assert.equal(await editor("dirty"), false);
    await clickControl("#settings-model-advanced");
    await clickControl("#settings-choose-file");
    assert.equal(await editor("model.path"), "/models/custom.bin");
    await clickControl("#settings-copy-path");
    assert.equal(
        await evaluate("window.fixtureClipboard"),
        "/models/custom.bin",
    );
    await clickControl("#settings-discard");
    await clickControl("#device-select");
    await until(
        async () =>
            await evaluate(
                `Boolean(document.querySelector('.settings-device-menu [role="option"]'))`,
            ),
        "Device choices missing",
    );
    assert(
        await evaluate(
            `document.querySelector('.settings-device-menu').textContent.includes('Microphones & Inputs')`,
        ),
    );
    assert(
        await evaluate(
            `document.querySelector('.settings-device-menu').textContent.includes('Computer Audio')`,
        ),
    );
    await evaluate(
        `Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent.includes('System Default Computer Audio')).setAttribute('data-fixture-output','')`,
    );
    await click("[data-fixture-output]");
    await until(
        async () =>
            (await editor("values.current_device.id")) === "default:output",
        "Output default was not selected",
    );
    assert.equal(await editor("dirty"), true);
    assert.deepEqual(
        await evaluate(
            "Object.keys(window.settingsModule.settings_editor.values.current_device).sort()",
        ),
        ["id", "name"],
    );
    await clickControl("#device-select");
    await key("End");
    await evaluate(
        `window.menuScroll=document.querySelector('.settings-device-menu [data-select-viewport]').scrollTop;window.menuFocus=document.activeElement.id;window.fixtureDevices.push({id:'hotplug',name:'New USB Microphone',kind:'input',is_default:false});`,
    );
    await until(
        async () =>
            await evaluate(
                `document.querySelector('.settings-device-menu')?.textContent.includes('New USB Microphone')`,
            ),
        "Automatic device refresh did not run",
    );
    assert.equal(await editor("values.current_device.id"), "default:output");
    assert.equal(await editor("dirty"), true);
    assert.equal(
        await evaluate(`document.activeElement.id`),
        await evaluate(`window.menuFocus`),
    );
    assert.equal(
        await evaluate(
            `document.querySelector('.settings-device-menu [data-select-viewport]').scrollTop`,
        ),
        await evaluate(`window.menuScroll`),
    );
    await key("Escape");
    await clickControl("#device-select");
    await key("n");
    await key("Enter");
    assert.equal(
        await editor("values.current_device.id"),
        "hotplug",
        "Typeahead must use the visible device name",
    );
    await clickControl("#settings-discard");
    await evaluate(
        `window.fixtureStates.internal_state.obj.transcribe_starting=true`,
    );
    await until(
        async () =>
            await evaluate(
                `Boolean(document.querySelector('button[aria-label="Cancel"]'))`,
            ),
        "Capture startup has no cancellation action",
    );
    await clickControl('button[aria-label="Cancel"]');
    assert.equal(
        await evaluate(
            `window.fixtureStates.internal_state.obj.transcribe_starting`,
        ),
        false,
    );
    await evaluate(
        `window.fixtureStates.internal_state.obj.active_transcription_run_id='new';window.sendFixtureEvent('audio_capture_failed',{run_id:'old',device_id:'mic-0',error:{kind:'device_unavailable',details:'stale audio failure'}})`,
    );
    assert(
        !(await evaluate(
            `document.body.textContent.includes('Captions stopped because')`,
        )),
    );
    await evaluate(
        `window.fixtureStates.internal_state.obj.active_transcription_run_id=null;window.sendFixtureEvent('audio_capture_failed',{run_id:'new',device_id:'mic-0',error:{kind:'device_unavailable',details:'device disconnected'}})`,
    );
    await until(
        async () =>
            await evaluate(
                `document.body.textContent.includes('Captions stopped because')`,
            ),
        "Capture failure was not explained",
    );
    await evaluate(
        `Array.from(document.querySelectorAll('[data-inbound-toast] button')).find(button=>button.textContent.trim()==='Dismiss').click()`,
    );
    await until(
        async () =>
            await evaluate(
                `document.querySelectorAll('[data-inbound-toast]').length===0`,
            ),
        "Capture failure notification did not dismiss",
    );
    for (const [width, height] of [
        [1300, 900],
        [880, 560],
        [390, 600],
    ] as const) {
        await viewport(width, height);
        await input("");
        await evaluate(
            `document.querySelector('#device-select').scrollIntoView({block:'center'});document.querySelector('#device-select').focus()`,
        );
        await key("ArrowDown");
        await delay(200);
        const menu = await evaluate(`(()=>{
            const content=document.querySelector('.settings-device-menu'), view=content?.querySelector('[data-select-viewport]');
            if(!content || !view)return null;
            return {rect:content.getBoundingClientRect().toJSON(),viewportHeight:view.clientHeight,scrollHeight:view.scrollHeight,contentOverflow:getComputedStyle(content).overflowY,pageWidth:document.documentElement.scrollWidth};
        })()`);
        assert(menu, "Device menu opened");
        assert(
            menu.rect.top >= -1 && menu.rect.bottom <= height + 1,
            "Device menu stays inside viewport",
        );
        assert(
            menu.scrollHeight > menu.viewportHeight,
            "Long device list scrolls",
        );
        assert.equal(menu.contentOverflow, "hidden");
        assert(
            menu.pageWidth <= width + 1,
            "Device menu adds no page overflow",
        );
        await key("End");
        await delay(100);
        assert(
            await evaluate(
                `document.querySelector('.settings-device-menu [data-select-viewport]').scrollTop>0`,
            ),
            "End scrolls to last device",
        );

        await key("Escape");
        assert.equal(
            await evaluate("document.activeElement.id"),
            "device-select",
        );
        await layoutCheck("devices-" + width);
    }
    await viewport(1300, 900);
    await evaluate(`window.fixtureFailure='get_audio_devices'`);
    await clickControl("#settings-refresh-devices");
    assert(
        await evaluate(
            `document.querySelector('[data-settings-section="audio"]').textContent.includes('Could not load audio sources')`,
        ),
    );
    await evaluate(`window.fixtureFailure=null;window.fixtureDevices=[]`);
    await clickControl("#settings-refresh-devices");
    await editor(
        'edit({...window.settingsModule.settings_editor.values,current_device:{id:"missing",name:"Disconnected microphone"}})',
    );
    assert(
        await evaluate(
            `document.querySelector('[data-settings-section="audio"]').textContent.includes('unavailable')`,
        ),
    );
    await editor(
        'edit({...window.settingsModule.settings_editor.values,current_device:{id:"alsa:null",name:"Legacy ALSA source"}})',
    );
    assert(
        await evaluate(
            `document.querySelector('[data-settings-section="audio"]').textContent.includes('no longer supported')`,
        ),
    );
    assert.equal(await editor("values.current_device.id"), "alsa:null");
    await clickControl("#settings-discard");
    assert.deepEqual(errors, []);
});
for (const [locale, width, height, font, reduced] of [
    ["en", 1300, 900, 16, false],
    ["ru", 880, 650, 16, false],
    ["en", 390, 650, 16, false],
    ["ru", 320, 650, 32, true],
] as const) {
    test(
        "Settings layout/search " +
            locale +
            " " +
            width +
            "x" +
            height +
            " font " +
            font +
            " reduced " +
            reduced,
        async ({ app }) => {
            const { evaluate, cdp, viewport, key, click, errors, artifacts } =
                app;

            const {
                initialize,
                reload,
                input,
                clickControl,
                layoutCheck,
                contrastReport,
            } = await settingsChecks(app);
            await app.page.goto("/settings");
            await initialize();
            await evaluate(
                "window.applied = JSON.parse(JSON.stringify(window.fixtureStates.app_state.obj)); window.applied.sidebar_open=false;window.applied.audio_segment_size=22;window.applied.model_path='/models/ggml-tiny-q8_0.bin';window.applied.overlay_config.style.font_size=77;localStorage.setItem('fixture-settings',JSON.stringify(window.applied));",
            );
            await evaluate(
                `localStorage.setItem('PARAGLIDE_LOCALE',${JSON.stringify(locale)})`,
            );
            await reload();
            await viewport(width, height);
            await evaluate(
                `document.documentElement.style.fontSize='${font}px'`,
            );
            await cdp("Emulation.setEmulatedMedia", {
                features: [
                    {
                        name: "prefers-reduced-motion",
                        value: reduced ? "reduce" : "no-preference",
                    },
                ],
            });
            await clickControl("#settings-audio-advanced");
            await clickControl("#settings-model-advanced");
            await layoutCheck(locale + "-" + width + "-advanced");
            await contrastReport(locale + "-" + width + "-advanced");
            await input(
                locale === "ru" ? "чувствительность" : "print_progress",
            );
            assert.equal(
                await evaluate(
                    `document.querySelectorAll('[data-settings-control]').length`,
                ),
                1,
            );
            await layoutCheck(locale + "-" + width + "-search");
            await input("");
            if (reduced)
                assert(
                    await evaluate(
                        `parseFloat(getComputedStyle(document.querySelector('#settings-model-advanced [data-disclosure-chevron]')).transitionDuration)<0.01`,
                    ),
                );
        },
    );
}
