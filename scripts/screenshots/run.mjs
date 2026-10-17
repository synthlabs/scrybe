import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
    mkdir,
    mkdtemp,
    readFile,
    writeFile,
    rm,
    access,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { readPng } from "./png.mjs";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HERE = dirname(fileURLToPath(import.meta.url));
export const PAGES = ["home", "settings", "overlay", "about"];

export function optionsFromEnv(env = process.env) {
    const page = env.SCRYBE_SCREENSHOT_PAGE || "home";
    const locale = env.SCRYBE_SCREENSHOT_LOCALE || "en";
    if (![...PAGES, "all"].includes(page))
        throw new Error(`Invalid PAGE: ${page}`);
    if (!["en", "ru"].includes(locale))
        throw new Error(`Invalid LOCALE: ${locale}`);
    const dimension = (value, fallback, minimum, name) => {
        const text = String(value || fallback);
        if (
            !/^\d+$/.test(text) ||
            Number(text) < minimum ||
            Number(text) > 16384
        )
            throw new Error(
                `${name} must be an integer from ${minimum} to 16384`,
            );
        return Number(text);
    };
    return {
        pages: page === "all" ? [...PAGES] : [page],
        locale,
        width: dimension(env.SCRYBE_SCREENSHOT_WIDTH, 1300, 880, "WIDTH"),
        height: dimension(env.SCRYBE_SCREENSHOT_HEIGHT, 900, 560, "HEIGHT"),
    };
}

export async function checkPort() {
    const server = createServer();
    await new Promise((accept, reject) => {
        server.once("error", () =>
            reject(
                new Error(
                    "Port 127.0.0.1:3030 is unavailable. Close the other server yourself, then retry.",
                ),
            ),
        );
        server.listen(
            { host: "127.0.0.1", port: 3030, exclusive: true },
            accept,
        );
    });
    await new Promise((accept, reject) =>
        server.close((error) => (error ? reject(error) : accept())),
    );
}

export function profileEnvironment(
    profile,
    identifier,
    platform = process.platform,
    env = process.env,
) {
    const result = { ...env };
    delete result.ENABLE_INTERNAL;
    delete result.SCRYBE_TEST_SKIP_BINDING_EXPORT;
    delete result.TAURI_CONFIG;
    delete result.TAURI_DEV;
    result.WEBVIEW2_USER_DATA_FOLDER = join(profile, "webview2");
    if (platform === "linux")
        Object.assign(result, {
            XDG_CONFIG_HOME: join(profile, "config"),
            XDG_DATA_HOME: join(profile, "data"),
            XDG_CACHE_HOME: join(profile, "cache"),
            GTK_A11Y: "always",
            GTK_MODULES: [env.GTK_MODULES, "atk-bridge"]
                .filter(Boolean)
                .join(":"),
            ACCESSIBILITY_ENABLED: "1",
        });
    // The unique bundle identifier isolates macOS and Windows known-folder paths, too.
    return result;
}

export async function stopProcess(child) {
    if (!child?.pid) return;
    if (process.platform === "win32") {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const killer = spawn(
            "taskkill.exe",
            ["/PID", String(child.pid), "/T", "/F"],
            { stdio: "ignore", windowsHide: true },
        );
        await once(killer, "exit").catch(() => {});
    } else {
        try {
            process.kill(-child.pid, "SIGTERM");
        } catch (error) {
            if (error.code !== "ESRCH") throw error;
        }
        if (child.exitCode === null && child.signalCode === null)
            await Promise.race([
                once(child, "exit"),
                delay(3000, undefined, { ref: false }),
            ]);
        try {
            process.kill(-child.pid, "SIGKILL");
        } catch (error) {
            if (error.code !== "ESRCH") throw error;
        }
    }
}

export function command(
    command,
    args,
    {
        cwd = ROOT,
        env = process.env,
        log,
        signal,
        timeout = 120000,
        background = false,
    } = {},
) {
    signal?.throwIfAborted();
    const output = log ? createWriteStream(log, { flags: "a" }) : null;
    const child = spawn(command, args, {
        cwd,
        env,
        shell: false,
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => {
        output?.write(data);
        if (!background) process.stdout.write(data);
    });
    child.stderr.on("data", (data) => {
        output?.write(data);
        if (!background) process.stderr.write(data);
    });
    child.once("close", () => output?.end());
    let timer;
    const cancel = () => {
        void stopProcess(child).catch(() => {});
    };
    signal?.addEventListener("abort", cancel, { once: true });
    const completion = new Promise((accept, reject) => {
        output?.once("error", (error) => {
            reject(error);
            cancel();
        });
        child.once("error", reject);
        child.once("close", (code, exitSignal) => {
            if (signal?.aborted) reject(signal.reason);
            else if (code !== 0)
                reject(
                    new Error(
                        `${command} exited ${code ?? exitSignal}${log ? `; see ${log}` : ""}`,
                    ),
                );
            else accept();
        });
        if (!background)
            timer = setTimeout(() => {
                reject(
                    new Error(`${command} timed out; see ${log || "output"}`),
                );
                cancel();
            }, timeout);
    }).finally(() => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
    });
    completion.catch(() => {});
    return { child, completion };
}

export async function labels(root = ROOT) {
    const result = {};
    for (const locale of ["en", "ru"]) {
        const messages = JSON.parse(
            await readFile(join(root, "messages", `${locale}.json`), "utf8"),
        );
        result[locale] = {
            language: messages[`locale_label_${locale}`],
            navigation: Object.fromEntries(
                PAGES.map((page) => [page, messages[`sidebar_${page}`]]),
            ),
            ready: {
                home: messages.home_empty_title,
                settings: messages.settings_subtitle,
                overlay: messages.overlay_style_preview,
                about: messages.about_intro,
            },
            loading: [
                "settings_loading",
                "settings_downloading",
                "settings_loading_model",
                "overlay_loading",
            ].map((key) => messages[key]),
            dismiss: messages.updater_dismiss,
        };
    }
    return result;
}

export function adapter(platform, env, runDir) {
    if (platform === "linux")
        return {
            executable: env.SCRYBE_SCREENSHOT_PYTHON || "/usr/bin/python3",
            args: [join(HERE, "linux.py")],
        };
    if (platform === "darwin")
        return { executable: join(runDir, "macos-helper"), args: [] };
    if (platform === "win32")
        return {
            executable: "powershell.exe",
            args: [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                join(HERE, "windows.ps1"),
            ],
        };
    throw new Error(`Unsupported platform: ${platform}`);
}

export function profilePaths(
    identifier,
    platform = process.platform,
    env = process.env,
) {
    if (platform === "darwin")
        return ["Application Support", "Caches", "WebKit", "Logs"]
            .map((part) => join(homedir(), "Library", part, identifier))
            .concat(
                join(
                    homedir(),
                    "Library",
                    "Preferences",
                    `${identifier}.plist`,
                ),
                join(
                    homedir(),
                    "Library",
                    "Saved Application State",
                    `${identifier}.savedState`,
                ),
            );
    if (platform === "win32")
        return [env.APPDATA, env.LOCALAPPDATA]
            .filter(Boolean)
            .map((base) => join(base, identifier));
    return [];
}

export async function capture(
    options,
    {
        root = ROOT,
        platform = process.platform,
        env = process.env,
        signal,
    } = {},
) {
    if (env.CARGO_BUILD_TARGET)
        throw new Error(
            "Unset CARGO_BUILD_TARGET: screenshots require a native host build",
        );
    const base = join(root, "target", "screenshots");
    await mkdir(base, { recursive: true });
    const runDir = await mkdtemp(
        join(base, `${new Date().toISOString().replace(/[:.]/g, "-")}-`),
    );
    console.log(`Screenshot logs and output: ${runDir}`);
    const identifier = `com.scrybe.screenshot.r${randomUUID().replaceAll("-", "")}`;
    const profile = join(runDir, "profile");
    const childEnv = profileEnvironment(profile, identifier, platform, env);
    const tool = adapter(platform, env, runDir);
    const running = new Set();
    const execute = async (executable, args, name, extra = {}) => {
        const owned = command(executable, args, {
            cwd: root,
            env: childEnv,
            log: join(runDir, `${name}.log`),
            signal,
            ...extra,
        });
        running.add(owned.child);
        try {
            return await owned.completion;
        } finally {
            await stopProcess(owned.child);
            running.delete(owned.child);
        }
    };
    let app;
    try {
        if (platform === "darwin")
            await execute(
                "swiftc",
                [join(HERE, "macos.swift"), "-o", tool.executable],
                "helper-build",
            );
        await execute(
            tool.executable,
            [...tool.args, platform === "win32" ? "-Preflight" : "--preflight"],
            "preflight",
        );
        if (platform === "win32")
            await execute(
                "dotnet",
                [
                    "build",
                    join(HERE, "windows-capture", "Capture.csproj"),
                    "-c",
                    "Release",
                    "-o",
                    join(runDir, "capture-helper"),
                    `-p:BaseIntermediateOutputPath=${join(runDir, "dotnet-obj")}/`,
                ],
                "helper-build",
                { timeout: 600000 },
            );
        await checkPort();
        const config = join(runDir, "tauri.screenshot.json");
        await writeFile(
            config,
            JSON.stringify(
                { identifier, bundle: { createUpdaterArtifacts: false } },
                null,
                2,
            ),
        );
        const args = [
            join(root, "node_modules", "@tauri-apps", "cli", "tauri.js"),
            "build",
            "--ci",
            "--no-sign",
            "--config",
            config,
            ...(platform === "darwin" ? ["--bundles", "app"] : ["--no-bundle"]),
        ];
        console.log("Building public release app…");
        await execute(process.execPath, args, "build", { timeout: 3600000 });
        await checkPort();
        const cargoTarget = resolve(root, env.CARGO_TARGET_DIR || "target");
        const binary =
            platform === "darwin"
                ? join(
                      cargoTarget,
                      "release",
                      "bundle",
                      "macos",
                      "Scrybe.app",
                      "Contents",
                      "MacOS",
                      "scrybe",
                  )
                : join(
                      cargoTarget,
                      "release",
                      platform === "win32" ? "scrybe.exe" : "scrybe",
                  );
        await access(binary);
        await mkdir(profile, { recursive: true });
        app = command(binary, [], {
            cwd: root,
            env: childEnv,
            log: join(runDir, "app.log"),
            signal,
            background: true,
        });
        const manifest = {
            ...options,
            pid: app.child.pid,
            outputDir: runDir,
            platform,
            labels: await labels(root),
            startupTimeout: 900,
            pageTimeout: 60,
            captureHelper: join(runDir, "capture-helper", "Capture.exe"),
        };
        const manifestPath = join(runDir, "run.json");
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        const automation = execute(
            tool.executable,
            [...tool.args, manifestPath],
            "automation",
            { timeout: 1200000 },
        );
        await Promise.race([
            automation,
            app.completion.then(() => {
                throw new Error("Scrybe exited before capture completed");
            }),
        ]);
        const results = JSON.parse(
            (await readFile(join(runDir, "result.json"), "utf8")).replace(
                /^\uFEFF/,
                "",
            ),
        );
        if (!Array.isArray(results) || results.length !== options.pages.length)
            throw new Error("Adapter returned incomplete results");
        for (const page of options.pages) {
            const result = results.find((result) => result.page === page);
            if (
                !result ||
                result.width !== options.width ||
                result.height !== options.height
            )
                throw new Error(
                    `Adapter did not verify content dimensions for ${page}`,
                );
            const path = join(
                runDir,
                `${page}-${options.locale}-${platform}.png`,
            );
            const png = await readPng(path);
            if (
                png.width !== result.pixelWidth ||
                png.height !== result.pixelHeight
            )
                throw new Error(
                    `Capture dimensions do not match adapter result: ${path}`,
                );
            console.log(path);
        }
        return { runDir, results };
    } finally {
        for (const child of running) await stopProcess(child);
        await stopProcess(app?.child);
        await app?.completion.catch(() => {});
        await rm(profile, { recursive: true, force: true });
        for (const path of profilePaths(identifier, platform, env))
            await rm(path, { recursive: true, force: true });
    }
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const controller = new AbortController();
    for (const event of ["SIGINT", "SIGTERM"])
        process.once(event, () =>
            controller.abort(new Error(`Interrupted (${event})`)),
        );
    try {
        await capture(optionsFromEnv(), { signal: controller.signal });
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
