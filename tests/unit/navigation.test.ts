import assert from "node:assert/strict";
import { test } from "vitest";
import { isActiveNavPath } from "$lib/navigation";

const destinations = ["/", "/overlay", "/settings"];

for (const [url, expected] of [
    ["tauri://localhost", "/"],
    ["tauri://localhost/", "/"],
    ["tauri://localhost?source=launch#home", "/"],
    ["http://localhost:1420/", "/"],
    ["http://tauri.localhost/", "/"],
    ["https://tauri.localhost/", "/"],
    ["tauri://localhost/overlay", "/overlay"],
    ["tauri://localhost/settings?section=audio#devices", "/settings"],
    ["tauri://localhost/about", null],
    ["tauri://localhost/missing", null],
    ["tauri://localhost/settings/extra", null],
] as const) {
    test(`active primary navigation for ${url}`, () => {
        const { pathname } = new URL(url);
        assert.deepEqual(
            destinations.filter((href) => isActiveNavPath(pathname, href)),
            expected === null ? [] : [expected],
        );
    });
}
