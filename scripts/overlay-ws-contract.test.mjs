import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readRepoFile = (path) =>
    readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const backendFiles = [
    "src-tauri/src/lib.rs",
    "src-tauri/src/ws.rs",
];

const overlayFiles = [
    "src/routes/v1/overlay/+page.svelte",
    "src/lib/components/overlay/align-buttons.svelte",
    "src/lib/components/overlay/color-swatches.svelte",
    "src/lib/components/overlay/overlay-canvas.svelte",
    "src/lib/components/overlay/preview-canvas.svelte",
    "src/lib/components/overlay/text-overlay.svelte",
];

const backendOwnedTypes = [
    "AppState",
    "OverlayConfig",
    "WebsocketRequest",
    "WebsocketResponse",
    "WhisperSegment",
];

const backendSources = new Map(
    backendFiles.map((path) => [path, readRepoFile(path)]),
);
const overlaySources = new Map(
    overlayFiles.map((path) => [path, readRepoFile(path)]),
);

function simpleTypeName(typeName) {
    return typeName.split("::").at(-1);
}

function collectBindingsImports(source) {
    const imports = new Set();
    const importPattern =
        /import\s+type\s+\{([\s\S]*?)\}\s+from\s+["']\$lib\/bindings["']/g;

    for (const match of source.matchAll(importPattern)) {
        for (const part of match[1].split(",")) {
            const name = part.trim().split(/\s+as\s+/)[0]?.trim();
            if (name) imports.add(name);
        }
    }

    return imports;
}

function collectStateTypes() {
    const stateTypeByKey = new Map();
    const typedVariables = new Map();

    for (const source of backendSources.values()) {
        for (const match of source.matchAll(
            /"([^"]+)"\s*=>\s*state_syncer\.emit::<([\w:]+)>\("\1"\)/g,
        )) {
            stateTypeByKey.set(match[1], simpleTypeName(match[2]));
        }

        for (const match of source.matchAll(
            /let\s+(?:mut\s+)?(\w+)\s*:\s*([\w:]+)\s*=/g,
        )) {
            typedVariables.set(match[1], simpleTypeName(match[2]));
        }

        for (const match of source.matchAll(
            /state_syncer\.update\("([^"]+)",\s*(\w+)(?:\.clone\(\))?,/g,
        )) {
            const typeName = typedVariables.get(match[2]);
            if (typeName) stateTypeByKey.set(match[1], typeName);
        }
    }

    return stateTypeByKey;
}

function collectBackendResponseKinds() {
    const kinds = new Set();

    for (const source of backendSources.values()) {
        for (const match of source.matchAll(
            /to_ws_response\(\s*"([^"]+)"\.to_owned\(\)/g,
        )) {
            kinds.add(match[1]);
        }

        for (const match of source.matchAll(
            /kind:\s*"([^"]+)"\.to_owned\(\)/g,
        )) {
            kinds.add(match[1]);
        }
    }

    return kinds;
}

function collectBackendRequestKinds() {
    const source = backendSources.get("src-tauri/src/ws.rs");
    const kinds = new Set();

    for (const match of source.matchAll(/"([^"]*)"\s*=>\s*\{/g)) {
        if (match[1]) kinds.add(match[1]);
    }

    return kinds;
}

function collectOverlayCaseBlocks(source) {
    const matches = [...source.matchAll(/case\s+"([^"]+)":/g)];

    return matches.map((match, index) => {
        const start = match.index + match[0].length;
        const nextCase = matches[index + 1]?.index ?? Infinity;
        const defaultMatch = /default:/.exec(source.slice(start));
        const nextDefault = defaultMatch
            ? start + defaultMatch.index
            : Infinity;
        const end = Math.min(nextCase, nextDefault);

        return {
            kind: match[1],
            body: source.slice(start, end === Infinity ? undefined : end),
        };
    });
}

function collectOverlayRequestKinds(source) {
    const kinds = new Set();
    const requestPattern =
        /(?:const|let)\s+\w+\s*:\s*WebsocketRequest\s*=\s*\{[\s\S]*?kind:\s*"([^"]+)"/g;

    for (const match of source.matchAll(requestPattern)) {
        kinds.add(match[1]);
    }

    return kinds;
}

test("overlay backend-owned DTOs come from generated bindings", () => {
    for (const [path, source] of overlaySources) {
        const imports = collectBindingsImports(source);

        for (const typeName of backendOwnedTypes) {
            assert.doesNotMatch(
                source,
                new RegExp(`\\b(?:type|interface)\\s+${typeName}\\b`),
                `${path} must not locally redefine ${typeName}`,
            );

            if (new RegExp(`\\b${typeName}\\b`).test(source)) {
                assert(
                    imports.has(typeName),
                    `${path} uses ${typeName} without importing it from $lib/bindings`,
                );
            }
        }
    }
});

test("overlay websocket response kinds match backend response kinds", () => {
    const backendResponseKinds = collectBackendResponseKinds();
    const overlayRoute = overlaySources.get("src/routes/v1/overlay/+page.svelte");
    const overlayCases = collectOverlayCaseBlocks(overlayRoute);

    for (const { kind } of overlayCases) {
        assert(
            backendResponseKinds.has(kind),
            `overlay handles ${kind}, but backend never emits that response kind`,
        );
    }
});

test("overlay state payload handlers use canonical state update kinds", () => {
    const stateTypeByKey = collectStateTypes();
    const stateKeyByType = new Map(
        [...stateTypeByKey].map(([key, typeName]) => [typeName, key]),
    );
    const overlayRoute = overlaySources.get("src/routes/v1/overlay/+page.svelte");
    const overlayCases = collectOverlayCaseBlocks(overlayRoute);
    const payloadPattern =
        /(?:const|let)\s+\w+\s*:\s*(\w+)\s*=\s*JSON\.parse\(event\.data\)/g;

    for (const { kind, body } of overlayCases) {
        for (const match of body.matchAll(payloadPattern)) {
            const stateKey = stateKeyByType.get(match[1]);
            if (!stateKey) continue;

            assert.equal(
                kind,
                `${stateKey}_update`,
                `${match[1]} payload must be handled under ${stateKey}_update`,
            );
        }
    }
});

test("overlay websocket request kinds match backend request handler", () => {
    const backendRequestKinds = collectBackendRequestKinds();
    const overlayRoute = overlaySources.get("src/routes/v1/overlay/+page.svelte");
    const overlayRequestKinds = collectOverlayRequestKinds(overlayRoute);

    for (const kind of overlayRequestKinds) {
        assert(
            backendRequestKinds.has(kind),
            `overlay sends ${kind}, but backend does not handle that request kind`,
        );
    }
});
