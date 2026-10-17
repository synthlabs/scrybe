import { capture, ROOT, profilePaths } from "./run.mjs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
    readFile,
    writeFile,
    lstat,
    readdir,
    readlink,
} from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const controller = new AbortController();
for (const event of ["SIGINT", "SIGTERM"])
    process.once(event, () =>
        controller.abort(new Error(`Interrupted (${event})`)),
    );
const tracked = [
    "README.md",
    "src/lib/bindings.ts",
    "internal/frontend/bindings.ts",
];
const digest = async (path) => {
    try {
        return createHash("sha256")
            .update(await readFile(join(ROOT, path)))
            .digest("hex");
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
};

async function treeDigest(paths) {
    const hash = createHash("sha256");
    async function visit(path) {
        hash.update(JSON.stringify(path));
        let stat;
        try {
            stat = await lstat(path);
        } catch (error) {
            if (error.code === "ENOENT") {
                hash.update("missing");
                return;
            }
            throw error;
        }
        if (stat.isSymbolicLink()) hash.update(`link:${await readlink(path)}`);
        else if (stat.isDirectory()) {
            hash.update("directory");
            for (const file of (await readdir(path)).sort())
                await visit(join(path, file));
        } else if (stat.isFile()) {
            hash.update(`file:${stat.size}:`);
            for await (const bytes of createReadStream(path))
                hash.update(bytes);
        }
    }
    for (const path of paths) await visit(path);
    return hash.digest("hex");
}

try {
    const before = await Promise.all(tracked.map(digest));
    const identifier = JSON.parse(
        await readFile(join(ROOT, "src-tauri/tauri.conf.json"), "utf8"),
    ).identifier;
    const normalProfiles =
        process.platform === "linux"
            ? [
                  process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
                  process.env.XDG_DATA_HOME || join(homedir(), ".local/share"),
                  process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
              ].map((base) => join(base, identifier))
            : profilePaths(identifier);
    const preserved = [join(ROOT, "screenshots"), ...normalProfiles];
    const originalFiles = await treeDigest(preserved);
    const runs = [];
    for (const locale of ["en", "ru"]) {
        for (const [width, height] of [
            [1300, 900],
            [1000, 650],
        ]) {
            runs.push(
                await capture(
                    {
                        pages: ["home", "settings", "overlay", "about"],
                        locale,
                        width,
                        height,
                    },
                    { signal: controller.signal },
                ),
            );
        }
    }
    const after = await Promise.all(tracked.map(digest));
    if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error("Capture modified README or bindings");
    if ((await treeDigest(preserved)) !== originalFiles)
        throw new Error(
            "Capture modified screenshots or a normal Scrybe profile",
        );
    const report = join(runs[0].runDir, "smoke.json");
    await writeFile(
        report,
        JSON.stringify(
            {
                platform: process.platform,
                runs,
                checks: [
                    "all pages",
                    "both locales",
                    "default and custom content dimensions",
                    "native density and frame bounds",
                    "README and bindings unchanged",
                    "screenshots and normal profiles unchanged",
                ],
            },
            null,
            2,
        ),
    );
    console.log(`Native smoke passed: ${report}`);
    console.log(
        "Review the PNGs for title bars, tight framing, absence of shadows/pointers, and correct defaults. Repeat on each display scale before declaring platform support verified.",
    );
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
