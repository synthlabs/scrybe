import {
    mkdir,
    readFile,
    writeFile,
    rename,
    rm,
    lstat,
    open,
} from "node:fs/promises";
import { resolve, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { readPng } from "./png.mjs";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const marker =
    /(<!-- scrybe-main-screenshot -->\s*<img\b[^>]*\bsrc=")([^"]+)("[^>]*>)/g;

async function plainFile(path) {
    if (!(await lstat(path)).isFile())
        throw new Error(`Expected a regular file: ${path}`);
}

export async function updateReadme(
    image,
    { root = ROOT, now = new Date(), checkpoint = async () => {} } = {},
) {
    if (!image) throw new Error("Supply IMAGE=/path/to/reviewed.png");
    const selected = await readPng(resolve(image));
    const readmePath = join(root, "README.md");
    const screenshots = join(root, "screenshots");
    await plainFile(readmePath);
    if (!(await lstat(screenshots)).isDirectory())
        throw new Error("screenshots must be a real directory");
    const lockPath = join(screenshots, ".readme-update.lock");
    let lock;
    try {
        lock = await open(lockPath, "wx");
    } catch (error) {
        if (error.code === "EEXIST")
            throw new Error(
                `Another update is active; inspect ${lockPath} before removing a stale lock`,
            );
        throw error;
    }
    let stage;
    let previous,
        previousBytes,
        readme,
        destination,
        destinationBytes,
        archived;
    let changed = false,
        reserved = false,
        keepRecovery = false;
    try {
        readme = await readFile(readmePath);
        const text = readme.toString("utf8");
        const matches = [...text.matchAll(marker)];
        if (matches.length !== 1)
            throw new Error(
                "README must contain exactly one scrybe-main-screenshot marker",
            );
        const source = matches[0][2];
        if (
            !/^screenshots\/[^/\\]+\.png$/.test(source) ||
            source.includes("..")
        )
            throw new Error(
                "Main screenshot must be a local PNG directly inside screenshots/",
            );
        previous = resolve(root, source);
        if (relative(screenshots, previous).includes(sep))
            throw new Error("Unsafe screenshot path");
        await plainFile(previous);
        previousBytes = await readFile(previous);
        if (previousBytes.equals(selected.bytes)) return { changed: false };
        destination = join(screenshots, "scrybe.png");
        if (destination !== previous) {
            try {
                await plainFile(destination);
                destinationBytes = await readFile(destination);
                throw new Error(
                    "screenshots/scrybe.png already exists but is not the referenced image",
                );
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
            }
        }
        const archiveDir = join(screenshots, "archive");
        await mkdir(archiveDir, { recursive: true });
        if (!(await lstat(archiveDir)).isDirectory())
            throw new Error("archive must be a real directory");
        const stamp = now.toISOString().replace(/[:.]/g, "-");
        const base = `${stamp}-${source.slice("screenshots/".length)}`;
        for (let suffix = 0; ; suffix++) {
            archived = join(
                archiveDir,
                suffix ? base.replace(/\.png$/, `-${suffix}.png`) : base,
            );
            try {
                const file = await open(archived, "wx");
                await file.close();
                reserved = true;
                break;
            } catch (error) {
                if (error.code !== "EEXIST") throw error;
            }
        }
        stage = join(screenshots, `.readme-stage-${randomUUID()}`);
        await mkdir(stage);
        const newReadme = text.replace(marker, "$1screenshots/scrybe.png$3");
        await writeFile(join(stage, "image.png"), selected.bytes);
        await writeFile(join(stage, "README.md"), newReadme);
        await checkpoint("staged");
        changed = true;
        await rename(previous, archived);
        await checkpoint("archived");
        await rename(join(stage, "image.png"), destination);
        await checkpoint("image");
        // Windows cannot rename over a destination opened by another process; rollback covers that failure.
        await rename(join(stage, "README.md"), readmePath);
        await checkpoint("readme");
        return { changed: true, image: destination, archive: archived };
    } catch (error) {
        if (changed) {
            const failures = [];
            for (const restore of [
                () => writeFile(previous, previousBytes),
                () => writeFile(readmePath, readme),
                () =>
                    destination !== previous && !destinationBytes
                        ? rm(destination, { force: true })
                        : Promise.resolve(),
            ]) {
                try {
                    await restore();
                } catch (failure) {
                    failures.push(failure);
                }
            }
            if (failures.length) {
                keepRecovery = true;
                throw new AggregateError(
                    [error, ...failures],
                    `Update failed and rollback needs attention; recovery files: ${stage}, ${archived}`,
                );
            }
        }
        if (reserved) await rm(archived, { force: true });
        throw error;
    } finally {
        if (stage && !keepRecovery)
            await rm(stage, { recursive: true, force: true });
        await lock.close();
        await rm(lockPath, { force: true });
    }
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    try {
        const result = await updateReadme(
            process.env.SCRYBE_SCREENSHOT_IMAGE || process.argv[2],
        );
        console.log(
            result.changed
                ? `Updated ${result.image}\nArchived ${result.archive}`
                : "Image is unchanged; nothing to update.",
        );
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
