import { readFileSync } from "node:fs";

/** Module specifiers a source file loads at runtime; `import type` is erased. */
export function runtimeImports(path: string) {
    const source = readFileSync(
        new URL(`../../../${path}`, import.meta.url),
        "utf8",
    );
    return [
        ...source.matchAll(
            /^import\s+(?!type\s)(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/gm,
        ),
    ].map((match) => match[1]);
}
