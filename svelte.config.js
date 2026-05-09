// Tauri doesn't have a Node.js server to do proper SSR
// so we will use adapter-static to prerender the app (SSG)
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { existsSync } from "node:fs";

const internalEnabled =
    process.env.ENABLE_INTERNAL === "1" &&
    existsSync("./internal/frontend/index.ts");
const internalEntry = internalEnabled
    ? "./internal/frontend/index.ts"
    : "./src/lib/internal/index.ts";
const internalDirectory = internalEnabled
    ? "./internal/frontend"
    : "./src/lib/internal";

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter(),
        alias: {
            '$utils': './utils/js',
            '$utils/*': './utils/js/*',
            '$internal': internalEntry,
            '$internal/*': `${internalDirectory}/*`,
        },
    },
};

export default config;
