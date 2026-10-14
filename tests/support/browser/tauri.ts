export const tauriSources = {
    home: `
        const callbacks = new Map(); let callbackId = 0;
        window.fixtureCalls = [];
        window.__TAURI_INTERNALS__ = {
            metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
            transformCallback(callback) { callbacks.set(++callbackId, callback); return callbackId; },
            unregisterCallback(id) { callbacks.delete(id); },
            async invoke(command, args) {
                window.fixtureCalls.push(command);
                if (command === window.fixtureFailure) throw new Error('Fixture diagnostic <private>');
                if (command === 'plugin:event|listen') return args.handler;
                if (command === 'start_transcribe') window.fixtureStates.internal_state.obj.transcribe_running = true;
                if (command === 'stop_transcribe') window.fixtureStates.internal_state.obj.transcribe_running = false;
                if (command === 'plugin:updater|check') return null;
                if (command === 'plugin:inbound|captured_errors') return [];
                if (command === 'plugin:inbound|capabilities') return {has_config:true};
                if (command === 'plugin:inbound|preview_system') return {os:'fixture',arch:'x86_64',locale:'en'};
                if (command === 'plugin:inbound|preview_build') return {app_version:'test',app_commit:'fixture',build_time:'1'};
                if (command === 'plugin:inbound|preview_log_tail') return {exists:true,byte_count:10,preview_text:'Fixture log',gzipped_size:20};
                if (command === 'plugin:inbound|preview_config') return '{}';
                if (command === 'get_audio_devices' || command === 'get_audio_formats' || command === 'get_models' || command === 'list_model_presets') return [];
                return null;
            }
        };
        window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
        if (!localStorage.getItem('PARAGLIDE_LOCALE')) localStorage.setItem('PARAGLIDE_LOCALE', 'en');
    `,
    settings: `
        const callbacks = new Map(), listeners = new Map(); let sequence = 0;
        window.fixtureBoot = Math.random(); window.calls = []; window.applied = JSON.parse(localStorage.getItem('fixture-settings') || 'null');
        window.fixtureDevices = Array.from({length: 45}, (_,index) => ({id:'mic-'+index,name:index === 0 ? 'Studio Microphone' : 'Audio source '+index+' - long USB audio device name',kind:index < 25 ? 'input' : 'output',is_default:false}));
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
                if(command === 'plugin:inbound|captured_errors') return [];
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
        Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.fixtureClipboard=text;}}});
        if(!localStorage.getItem('PARAGLIDE_LOCALE')) localStorage.setItem('PARAGLIDE_LOCALE','en');
    `,
    overlay: `
        const callbacks = new Map(); let sequence = 0;
        window.calls = []; window.applied = JSON.parse(localStorage.getItem('fixture-applied') || 'null');
        window.__TAURI_INTERNALS__ = {
            metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
            transformCallback(callback) { callbacks.set(++sequence, callback); return sequence; },
            unregisterCallback(id) { callbacks.delete(id); },
            async invoke(command, args) {
                window.calls.push({ command, args });
                if (command === window.fixtureFailure) throw new Error('Test diagnostic');
                if (command === 'plugin:event|listen') return args.handler;
                if (command === 'plugin:updater|check') return null;
                if (command === 'plugin:inbound|captured_errors') return [];
                if (command === 'get_audio_devices' || command === 'get_audio_formats' || command === 'get_models' || command === 'list_model_presets') return [];
                if (command === 'update_state') {
                    const next = JSON.parse(args.state.value);
                    window.applied = structuredClone(next); localStorage.setItem('fixture-applied', JSON.stringify(next));
                    window.fixtureStates.app_state.obj = next;
                    return true;
                }
                if (command === 'start_overlay_test') {
                    const state = { id: 'test-' + Date.now(), config: args.config, text: args.text, started_at_ms: Date.now(), expires_at_ms: Date.now() + 60000, revision: 0 };
                    window.editorModule.overlay_test.obj = state;
                    return state;
                }
                if (command === 'update_overlay_test') {
                    const test = window.editorModule.overlay_test.obj;
                    if (test.id !== args.id || test.expires_at_ms <= Date.now() || args.revision <= test.revision) return false;
                    window.editorModule.overlay_test.obj = { ...test, config: args.config, text: args.text, revision: args.revision };
                    return true;
                }
                if (command === 'stop_overlay_test') { window.editorModule.overlay_test.obj = { id:'',config:null,text:'',started_at_ms:0,expires_at_ms:0,revision:0 }; return true; }
                return null;
            }
        };
        window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
        if (!localStorage.getItem('PARAGLIDE_LOCALE')) localStorage.setItem('PARAGLIDE_LOCALE','en');
        const NativeWebSocket = window.WebSocket;
        window.WebSocket = class extends NativeWebSocket {
            constructor(url) {
                if (url !== 'ws://localhost:3030/ws') { super(url); return; }
                return window.outputSocket = { send(value) { window.outputRequests = [...(window.outputRequests || []), JSON.parse(value)]; }, close() {} };
            }
        };
    `,
    inputLock: `
        const callbacks = new Map(); let callbackId = 0;
        window.__TAURI_INTERNALS__ = {
            metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
            transformCallback(callback) { callbacks.set(++callbackId, callback); return callbackId; },
            unregisterCallback(id) { callbacks.delete(id); },
            async invoke(command, args) {
                if (command === 'plugin:event|listen') return args.handler;
                if (['plugin:inbound|captured_errors', 'get_audio_devices', 'get_audio_formats', 'get_models', 'list_model_presets'].includes(command)) return [];
                return null;
            }
        };
        window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
        localStorage.setItem('PARAGLIDE_LOCALE', 'en');
    `,
    session: `
        const callbacks = new Map(), listeners = new Map(); let callbackId = 0;
        window.calls = []; window.starts = []; window.resetRevision = 0;
        window.fire = (event, payload) => { for (const handler of listeners.get(event) || []) callbacks.get(handler)?.({ event, payload }); };
        window.idle = () => { const state = window.states.internal_state.obj; state.transcribe_starting = false; state.transcribe_running = false; state.active_transcription_run_id = null; };
        window.completeStart = (index, error) => {
            const start = window.starts[index];
            if (!error) { window.states.internal_state.obj.transcribe_starting = false; window.states.internal_state.obj.transcribe_running = true; start.resolve(); }
            else { if (window.states.internal_state.obj.active_transcription_run_id === start.id) window.idle(); start.reject(error); }
        };
        window.__TAURI_INTERNALS__ = {
            metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
            transformCallback(callback) { callbacks.set(++callbackId, callback); return callbackId; },
            unregisterCallback(id) { callbacks.delete(id); },
            async invoke(command, args) {
                window.calls.push(command);
                if (command === 'plugin:event|listen') { listeners.set(args.event, [...(listeners.get(args.event) || []), args.handler]); return args.handler; }
                if (command === 'start_transcribe') {
                    const id = 'run-' + window.starts.length;
                    window.states.internal_state.obj.transcribe_starting = true;
                    window.states.internal_state.obj.active_transcription_run_id = id;
                    return new Promise((resolve, reject) => window.starts.push({ id, resolve, reject }));
                }
                if (command === 'stop_transcribe') { window.idle(); return; }
                if (command === 'new_session') {
                    window.idle();
                    window.states.audio_metrics.obj = structuredClone(window.defaults.DefaultAudioMetricsState);
                    window.states.gate_telemetry.obj = structuredClone(window.defaults.DefaultGateTelemetryState);
                    const reset = { revision: ++window.resetRevision };
                    window.fire('session_reset', reset);
                    return reset;
                }
                if (command === 'plugin:updater|check') return null;
                if (command === 'plugin:inbound|captured_errors') return [];
                if (command === 'get_audio_devices' || command === 'list_model_presets') return [];
                return null;
            }
        };
        window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
        localStorage.setItem('PARAGLIDE_LOCALE', 'en');
    `,
    inbound: `
        const callbacks = new Map(), listeners = new Map(); let sequence = 0;
        window.fixtureBoot = Math.random();
        window.submissions=[]; window.nativeSequence=1;
        window.starts=[]; window.resetRevision=0;
        window.idleSession=()=>{const state=window.fixtureStates.internal_state.obj;state.transcribe_running=false;state.transcribe_starting=false;state.active_transcription_run_id=null;};
        window.completeStart=(index,error)=>{const start=window.starts[index];if(window.fixtureStates.internal_state.obj.active_transcription_run_id===start.id)window.idleSession();error?start.reject(error):start.resolve();};
        window.initialCapture={id:'1',error:{kind:'error',message:'Startup diagnostic',target:'startup',timestamp:'1'}}; window.calls = []; window.applied = JSON.parse(localStorage.getItem('fixture-settings') || 'null');
        window.fixtureDevices = Array.from({length: 45}, (_,index) => ({id:'mic-'+index,name:index === 0 ? 'Studio Microphone' : 'Audio source '+index+' - long USB audio device name',kind:index < 25 ? 'input' : 'output',is_default:false}));
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
                if(command === window.fixtureFailure) throw window.fixtureError ?? {kind:window.fixtureErrorKind || 'model_load',details:'Fixture failure'};
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
                if(command === 'start_transcribe'){
                    const state=window.fixtureStates.internal_state.obj;
                    if(window.deferStart){const id='run-'+window.starts.length;state.transcribe_starting=true;state.active_transcription_run_id=id;return new Promise((resolve,reject)=>window.starts.push({id,resolve,reject}));}
                    state.transcribe_running=true;state.transcribe_starting=false;return null;
                }
                if(command === 'stop_transcribe'){window.idleSession();return null;}
                if(command === 'new_session'){window.idleSession();const reset={revision:++window.resetRevision};window.sendFixtureEvent('session_reset',reset);return reset;}
                return null;
            }
        };
        window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
        Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(window.clipboardFailure)throw new Error('Clipboard fixture failure');window.fixtureClipboard=text;}}});
        if(!localStorage.getItem('PARAGLIDE_LOCALE')) localStorage.setItem('PARAGLIDE_LOCALE','en');
    `,
} as const;
export type TauriScenario = keyof typeof tauriSources;
