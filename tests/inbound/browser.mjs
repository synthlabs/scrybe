import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const artifacts = await mkdtemp(join(tmpdir(), "scrybe-inbound-"));
const log = await open(join(artifacts, "process.log"), "w");
const server = spawn(
    process.execPath,
    [
        "tests/inbound/dev-server.mjs",
        "--host",
        "127.0.0.1",
        "--port",
        "1457",
        "--strictPort",
    ],
    { stdio: ["ignore", log.fd, log.fd] },
);
const browser = spawn(
    process.env.SCRYBE_TEST_CHROMIUM || "chromium",
    [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--disable-background-networking",
        "--disable-sync",
        "--remote-debugging-port=0",
        `--user-data-dir=${join(artifacts, "profile")}`,
        "about:blank",
    ],
    { stdio: ["ignore", log.fd, log.fd] },
);
let socket;
let captureFailure;
const errors = [];
const reports = [];
async function until(check, message) {
    for (let attempt = 0; attempt < 200; attempt++) {
        try {
            if (await check()) return;
        } catch {}
        await delay(75);
    }
    throw new Error(message);
}
try {
    await until(
        async () => (await fetch("http://127.0.0.1:1457/")).ok,
        "Vite did not start",
    );
    let port;
    await until(
        async () =>
            (port = (
                await readFile(
                    join(artifacts, "profile/DevToolsActivePort"),
                    "utf8",
                )
            ).split("\n")[0]),
        "Chromium did not start",
    );
    const pages = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json();
    socket = new WebSocket(
        pages.find((page) => page.type === "page").webSocketDebuggerUrl,
    );
    await new Promise((resolve) =>
        socket.addEventListener("open", resolve, { once: true }),
    );
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener("message", ({ data }) => {
        const message = JSON.parse(data);
        if (message.id) {
            const request = pending.get(message.id);
            pending.delete(message.id);
            message.error
                ? request.reject(new Error(JSON.stringify(message.error)))
                : request.resolve(message.result);
        } else if (message.method === "Runtime.exceptionThrown")
            errors.push(
                message.params.exceptionDetails.exception?.description ||
                    message.params.exceptionDetails.text,
            );
    });
    const cdp = (method, params = {}) =>
        new Promise((resolve, reject) => {
            const id = ++sequence;
            pending.set(id, { resolve, reject });
            socket.send(JSON.stringify({ id, method, params }));
        });
    const evaluate = async (expression) => {
        const result = await cdp("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
        });
        if (result.exceptionDetails)
            throw new Error(
                result.exceptionDetails.exception?.description ||
                    result.exceptionDetails.text,
            );
        return result.result.value;
    };
    const key = async (key) => {
        const code = key === " " ? "Space" : key;
        const windowsVirtualKeyCode =
            key === "Enter"
                ? 13
                : key === " "
                  ? 32
                  : key === "Tab"
                    ? 9
                    : key === "Escape"
                      ? 27
                      : undefined;
        await cdp("Input.dispatchKeyEvent", {
            type: "keyDown",
            key,
            code,
            windowsVirtualKeyCode,
            text: key === "Enter" ? "\r" : key === " " ? " " : undefined,
        });
        await cdp("Input.dispatchKeyEvent", {
            type: "keyUp",
            key,
            code,
            windowsVirtualKeyCode,
        });
        await delay(60);
    };
    const click = async (selector) => {
        await evaluate(
            `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`,
        );
        await delay(100);
        const rect = await evaluate(
            `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`,
        );
        await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...rect });
        await cdp("Input.dispatchMouseEvent", {
            type: "mousePressed",
            button: "left",
            clickCount: 1,
            ...rect,
        });
        await cdp("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            button: "left",
            clickCount: 1,
            ...rect,
        });
        await delay(180);
    };
    const screenshot = async (name) => {
        const { data } = await cdp("Page.captureScreenshot", { format: "png" });
        await writeFile(
            join(artifacts, `${name}.png`),
            Buffer.from(data, "base64"),
        );
    };
    const viewport = async (width, height) =>
        cdp("Emulation.setDeviceMetricsOverride", {
            width,
            height,
            deviceScaleFactor: 1,
            mobile: false,
        });
    const contrastReport = async (name) => {
        const samples = await evaluate(`(() => {
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
    captureFailure = async () => {
        await screenshot("failure");
        await writeFile(
            join(artifacts, "state.json"),
            JSON.stringify(
                await evaluate(
                    `({calls:window.calls,error:window.settingsModule?.settings_editor.error,overflow:[...document.querySelectorAll('[data-settings-editor] *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1 && el.getBoundingClientRect().height>0).map(el=>({tag:el.tagName,id:el.id,cls:el.className,width:el.getBoundingClientRect().width,text:el.textContent?.slice(0,90)}))})`,
                ),
                null,
                2,
            ),
        );
    };
    await cdp("Runtime.enable");
    await cdp("Page.enable");
    await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
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
    await cdp("Page.addScriptToEvaluateOnNewDocument", {
        source: `
        const callbacks = new Map(), listeners = new Map(); let sequence = 0;
        window.fixtureBoot = Math.random();
        window.submissions=[]; window.nativeSequence=1;
        window.initialCapture={id:'1',error:{kind:'error',message:'Startup diagnostic',target:'startup',timestamp:'1'}}; window.calls = []; window.applied = JSON.parse(localStorage.getItem('fixture-settings') || 'null');
        window.fixtureDevices = Array.from({length: 45}, (_,index) => ({id:'mic-'+index,name:index === 0 ? 'Studio Microphone' : 'Audio source '+index+' — long USB audio device name',kind:index < 25 ? 'input' : 'output',is_default:false}));
        window.fixtureDevices.unshift({id:'',name:'Studio Microphone',kind:'input',is_default:true},{id:'default:output',name:'Speakers',kind:'output',is_default:true});
        window.fixtureModels = [
            ['tiny-q8_0','Tiny (Q8_0)',44],['base-q8_0','Base (Q8_0)',82],['small-q8_0','Small (Q8_0)',264],
            ['medium-q8_0','Medium (Q8_0)',823],['large-v3-turbo-q5_0','Large v3 Turbo (Q5_0)',574],['large-v3-turbo-q8_0','Large v3 Turbo (Q8_0)',874]
        ].map(([id,label,size_mb])=>({id,label,size_mb,filename:'ggml-'+id+'.bin',description:'Model',repo:'fixture',resource_rank:1,auto_selectable:true}));
        window.sendFixtureEvent = (name,payload) => { for(const [handler,event] of listeners) if(event===name) callbacks.get(handler)?.({event:name,id:handler,payload}); };
        window.__TAURI_INTERNALS__ = {
            metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},
            transformCallback(callback){callbacks.set(++sequence,callback);return sequence;},
            unregisterCallback(id){callbacks.delete(id);},
            async invoke(command,args){
                window.calls.push({command,args});
                if(command === window.fixtureFailure) throw {kind:window.fixtureErrorKind || 'model_load',details:'Fixture failure'};
                if(command === 'plugin:event|listen'){listeners.set(args.handler,args.event);return args.handler;}
                if(command === 'plugin:event|unlisten'){listeners.delete(args.eventId);return null;}
                if(command === 'plugin:updater|check') return null;
                if(command === 'plugin:inbound|captured_errors') {
                    window.sendFixtureEvent('inbound://error-captured',window.initialCapture);
                    return [window.initialCapture];
                }
                if(command === 'plugin:inbound|capabilities') return {has_config:true};
                if(command === 'plugin:inbound|preview_system') return {os:'fixture',arch:'x86_64',locale:'en'};
                if(command === 'plugin:inbound|preview_build') return {app_version:'test',app_commit:'fixture',build_time:'1'};
                if(command === 'plugin:inbound|preview_log_tail') return {exists:true,byte_count:100,preview_text:'Fixture local diagnostics',gzipped_size:80};
                if(command === 'plugin:inbound|preview_config') return '{"safe":"fixture"}';
                if(command === 'plugin:inbound|submit') {
                    window.submissions.push(structuredClone(args.input));
                    if(window.failSubmit) throw new Error('Fixture submission unavailable');
                    return null;
                }
                if(command === 'plugin:log|log' && args.level===5 && args.keyValues?.['inbound.handled']!=='true') {
                    window.sendFixtureEvent('inbound://error-captured',{id:String(++window.nativeSequence),error:{kind:'error',message:args.message,target:'webview',timestamp:'1'}});
                }
                if(command === 'get_audio_devices') return window.fixtureDevices;
                if(command === 'list_model_presets'){
                    if(window.deferModels) await new Promise(resolve=>window.finishModels=resolve);
                    return window.fixtureModels;
                }
                if(command === 'plugin:dialog|open') return window.fixtureFile ?? '/models/custom.bin';
                if(command === 'apply_settings'){
                    window.sendFixtureEvent('settings_apply_progress','loading');
                    if(window.deferApply) await new Promise(resolve=>window.finishApply=resolve);
                    const current = window.fixtureStates.app_state.obj;
                    const selection=args.request.model;
                    const path=selection?.kind==='preset' ? '/models/ggml-'+selection.id+'.bin' : selection?.kind==='file' ? selection.path : current.model_path;
                    const snapshot={values:structuredClone(args.request.values),model_path:path};
                    window.applied={...JSON.parse(JSON.stringify(current)),...snapshot.values,model_path:path};
                    window.fixtureStates.app_state.obj=structuredClone(window.applied);
                    localStorage.setItem('fixture-settings',JSON.stringify(window.applied));
                    return snapshot;
                }
                if(command === 'update_state'){
                    window.fixtureStates.app_state.obj=JSON.parse(args.state.value); return true;
                }
                if(command === 'start_transcribe'){window.fixtureStates.internal_state.obj.transcribe_running=true;return null;}
                if(command === 'stop_transcribe'){window.fixtureStates.internal_state.obj.transcribe_running=false;window.fixtureStates.internal_state.obj.transcribe_starting=false;return null;}
                return null;
            }
        };
        window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
        Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(window.clipboardFailure)throw new Error('Clipboard fixture failure');window.fixtureClipboard=text;}}});
        if(!localStorage.getItem('PARAGLIDE_LOCALE')) localStorage.setItem('PARAGLIDE_LOCALE','en');
    `,
    });
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
        await cdp("Page.reload");
        await until(async () => {
            const boot = await evaluate("window.fixtureBoot");
            return typeof boot === "number" && boot !== previous;
        }, "Page did not reload");
        await initialize();
    }

    await cdp("Page.navigate", { url: "http://127.0.0.1:1457/settings" });
    await initialize();
    await evaluate(
        `(async()=>{window.errorModule=await import('/src/lib/errors/index.ts')})()`,
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
    const advanceTo = async (step) => {
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
    const emit = async (id, message) =>
        evaluate(
            `window.sendFixtureEvent('inbound://error-captured',${JSON.stringify({ id, error: { kind: "error", message, target: "native", timestamp: "1" } })})`,
        );

    assert.equal(
        await notificationCount(),
        1,
        "Snapshot and event must produce one notification",
    );
    assert.equal(
        await evaluate(
            `document.querySelectorAll('[data-inbound-toast] details').length`,
        ),
        0,
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-toast]').textContent.includes('Startup diagnostic')`,
        ),
        false,
    );
    await clearNotifications();

    // A caught action logs its diagnostics without creating a second toast.
    await evaluate(`window.fixtureFailure='start_transcribe'`);
    await click('button[aria-label="Start"]');
    await until(
        async () => (await notificationCount()) === 1,
        "Start failure missing",
    );
    await delay(500);
    assert.equal(await notificationCount(), 1);
    assert.equal(
        await evaluate(
            `window.calls.filter(c=>c.command==='plugin:log|log').at(-1).args.keyValues['inbound.handled']`,
        ),
        "true",
    );
    await screenshot("compact-action-error");
    await contrastReport("compact-action-error");
    await reportToast();
    await evaluate(`window.fixtureFailure=undefined;`);
    await key("Tab");
    assert.equal(
        await evaluate(`!!document.activeElement.closest('[role="dialog"]')`),
        true,
        "Keyboard focus must stay in sheet",
    );
    await next();
    await evaluate(
        `const field=document.querySelector('#inbound-message');field.value='What I was doing';field.dispatchEvent(new Event('input',{bubbles:true}));`,
    );
    await evaluate(`window.fixtureFailure='plugin:inbound|preview_system'`);
    await next();
    await until(
        () => evaluate(`!!document.querySelector('[data-inbound-load-error]')`),
        "Preview failure missing",
    );
    assert.equal(
        await notificationCount(),
        0,
        "Preview failure must stay in sheet",
    );
    await evaluate(`window.fixtureFailure=undefined`);
    await click('[data-inbound-load-error] [data-inbound-action="retry"]');
    await until(
        () => evaluate(`!document.querySelector('[data-inbound-load-error]')`),
        "Preview retry failed",
    );
    await advanceTo("error");
    const selected = await evaluate(
        `window.errorModule.errors.snapshot().report.error`,
    );
    assert(selected.message.includes("Fixture failure"));
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-preview]').textContent.includes('Fixture failure')`,
        ),
        true,
    );
    await emit("100", "New error while reporting");
    await emit("101", "New error while reporting");
    await delay(200);
    assert.equal(await notificationCount(), 0, "Incoming errors should queue");
    await advanceTo("preview");
    await evaluate(`window.failSubmit=true`);
    await click('[data-inbound-action="send"]');
    await until(
        async () => (await currentStep()) === "failed",
        "Submission failure missing",
    );
    assert.equal(
        await notificationCount(),
        0,
        "Submission failure must stay in sheet",
    );
    await evaluate(`window.failSubmit=false`);
    await click('[data-inbound-action="retry"]');
    await click('[data-inbound-action="send"]');
    await until(
        async () => (await currentStep()) === "done",
        "Submission retry failed",
    );
    const submissions = await evaluate("window.submissions");
    assert.equal(submissions.length, 2);
    for (const input of submissions) {
        assert.deepEqual(input.error, selected);
        assert.equal(input.message, "What I was doing");
        assert.equal(input.include.error, true);
    }
    await click('[data-inbound-action="close"]');
    await until(
        async () => (await notificationCount()) === 1,
        "Queued errors did not resume",
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-toast]').textContent.includes('Occurred 2 times')`,
        ),
        true,
    );
    await clearNotifications();

    // Native errors keep arriving after the first report, and error inclusion remains optional.
    await emit("102", "Second reviewed error");
    await reportToast();
    await advanceTo("error");
    await click("#inbound-include-error");
    await next();
    await click('[data-inbound-action="send"]');
    await until(
        async () => (await currentStep()) === "done",
        "Report without error failed",
    );
    assert.equal(
        await evaluate("window.submissions.at(-1).include.error"),
        false,
    );
    await closeReport();

    // Settings errors keep their inline recovery and open the same report host.
    await evaluate(
        `(async()=>{window.fixtureFailure='apply_settings';window.settingsModule.settings_editor.edit({...window.settingsModule.settings_editor.values,audio_segment_size:22});await window.settingsModule.settings_editor.apply()})()`,
    );
    assert.equal(await notificationCount(), 0);
    await click("[data-settings-error] button");
    assert.equal(
        await evaluate(
            `window.errorModule.errors.snapshot().report.error.target`,
        ),
        "settings.apply",
    );
    await closeReport();
    assert.equal(
        await evaluate(
            `document.activeElement.closest('[data-settings-error]') !== null`,
        ),
        true,
        "Focus should return to inline report action",
    );
    await evaluate(
        `window.fixtureFailure=undefined;window.settingsModule.settings_editor.discard()`,
    );
    await click("#settings-report");
    assert.equal(
        await evaluate(`window.errorModule.errors.snapshot().report.error`),
        null,
    );
    await closeReport();
    assert.equal(
        await evaluate(`document.activeElement.id`),
        "settings-report",
    );

    // Recovered runtime outcomes retain a warning; unrecovered ones keep their recovery link.
    await evaluate(
        `window.fixtureStates.internal_state.obj.runtime_dependency={status:'ready_cpu_fallback',reason:'GPU fixture',has_nvidia_gpu:true,action_url:'https://example.test/driver'}`,
    );
    await delay(300);
    assert.equal(await notificationCount(), 0);
    await evaluate(
        `window.fixtureStates.internal_state.obj.runtime_dependency={status:'unavailable',reason:'Runtime fixture',has_nvidia_gpu:true,action_url:'https://example.test/driver'}`,
    );
    await until(
        async () => (await notificationCount()) === 1,
        "Runtime error missing",
    );
    assert.equal(
        await evaluate(
            `document.querySelectorAll('[data-inbound-toast] button').length`,
        ),
        3,
    );
    await click("[data-inbound-toast] button:first-child");
    assert.equal(
        await evaluate(
            `window.calls.some(c=>c.command==='plugin:opener|open_url')`,
        ),
        true,
    );
    await clearNotifications();

    // Global JavaScript errors are reportable through the same flow.
    await evaluate(
        `window.dispatchEvent(new ErrorEvent('error',{message:'Global fixture',error:new Error('Global fixture')}))`,
    );
    await until(
        async () => (await notificationCount()) === 1,
        "Global exception missing",
    );
    await clearNotifications();
    await evaluate(
        `window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{promise:Promise.resolve(),reason:new Error('Rejection fixture')}))`,
    );
    await until(
        async () => (await notificationCount()) === 1,
        "Unhandled rejection missing",
    );
    await clearNotifications();

    // Both languages, constrained layouts, focus cues, and reduced motion.
    for (const [locale, width, height, font, reduced] of [
        ["en", 1000, 800, 16, false],
        ["ru", 640, 640, 20, false],
        ["ru", 400, 600, 20, true],
    ]) {
        await evaluate(
            `localStorage.setItem('PARAGLIDE_LOCALE',${JSON.stringify(locale)})`,
        );
        await reload();
        await evaluate(
            `(async()=>{window.errorModule=await import('/src/lib/errors/index.ts');document.documentElement.style.fontSize='${font}px'})()`,
        );
        await viewport(width, height);
        await cdp("Emulation.setEmulatedMedia", {
            features: [
                {
                    name: "prefers-reduced-motion",
                    value: reduced ? "reduce" : "no-preference",
                },
            ],
        });
        await clearNotifications();
        await click("#settings-report");
        await next();
        await screenshot(`${locale}-${width}-report`);
        await contrastReport(`${locale}-${width}-report`);
        assert.equal(
            await evaluate(
                `document.querySelector('[role="dialog"]').scrollWidth<=document.querySelector('[role="dialog"]').clientWidth+1`,
            ),
            true,
            "Sheet must not overflow horizontally",
        );
        if (locale === "ru")
            assert.equal(
                await evaluate(
                    `document.querySelector('[data-inbound-wizard]').textContent.includes('What happened?')`,
                ),
                false,
            );
        if (reduced)
            assert.equal(
                await evaluate(
                    `parseFloat(getComputedStyle(document.querySelector('[role="dialog"]')).animationDuration)<0.01`,
                ),
                true,
            );
        await advanceTo("config");
        await screenshot(`${locale}-${width}-details`);
        await closeReport();
    }
    assert.deepEqual(errors, []);
    await writeFile(
        join(artifacts, "result.json"),
        JSON.stringify({ passed: true, submissions, errors }, null, 2),
    );
    console.log(`Inbound browser checks passed: ${artifacts}`);
} catch (error) {
    try {
        await captureFailure?.();
    } catch {}
    await writeFile(
        join(artifacts, "failure.json"),
        JSON.stringify({ error: String(error), errors }, null, 2),
    );
    console.error(`Inbound browser checks failed: ${artifacts}`);
    throw error;
} finally {
    socket?.close();
    browser.kill("SIGTERM");
    server.kill("SIGTERM");
    await log.close();
}
