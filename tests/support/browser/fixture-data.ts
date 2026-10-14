import { DefaultAppState } from "../../../src/lib/defaults.ts";
import { tauriSources } from "./tauri.ts";

console.log(JSON.stringify({ defaults: DefaultAppState, tauriSources }));
