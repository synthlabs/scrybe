import test from "node:test";
import assert from "node:assert/strict";
import {
    mkdtemp,
    mkdir,
    writeFile,
    readFile,
    readdir,
    rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { createServer } from "node:net";
import { spawnSync } from "node:child_process";
import { Script } from "node:vm";
import { crc32, validatePng } from "../../scripts/screenshots/png.mjs";
import { updateReadme } from "../../scripts/screenshots/update-readme.mjs";
import {
    optionsFromEnv,
    profileEnvironment,
    profilePaths,
    checkPort,
    command,
    stopProcess,
    labels,
    ROOT,
    capture,
} from "../../scripts/screenshots/run.mjs";

function chunk(type, body) {
    const bytes = Buffer.alloc(body.length + 12);
    bytes.writeUInt32BE(body.length);
    bytes.write(type, 4);
    body.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
    return bytes;
}

function png(color = 0) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1, 0);
    header.writeUInt32BE(1, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([
        Buffer.from("89504e470d0a1a0a", "hex"),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(Buffer.from([0, color, 10, 20, 255]))),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), "scrybe screenshots "));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "screenshots"));
    const readme =
        '<img src="screenshots/logo.png" height="180">\r\n<p>\r\n  <!-- scrybe-main-screenshot -->\r\n  <img src="screenshots/legacy.png" height="500">\r\n</p>\r\n';
    await writeFile(join(root, "README.md"), readme);
    await writeFile(join(root, "screenshots", "legacy.png"), png(1));
    await writeFile(join(root, "screenshots", "logo.png"), png(9));
    const image = join(root, "reviewed image.png");
    await writeFile(image, png(2));
    return { root, image, readme };
}

test("arguments select pages, locales and logical content dimensions", () => {
    assert.deepEqual(optionsFromEnv({}), {
        pages: ["home"],
        locale: "en",
        width: 1300,
        height: 900,
    });
    assert.deepEqual(
        optionsFromEnv({
            SCRYBE_SCREENSHOT_PAGE: "all",
            SCRYBE_SCREENSHOT_LOCALE: "ru",
            SCRYBE_SCREENSHOT_WIDTH: "1440",
            SCRYBE_SCREENSHOT_HEIGHT: "1000",
        }),
        {
            pages: ["home", "settings", "overlay", "about"],
            locale: "ru",
            width: 1440,
            height: 1000,
        },
    );
    for (const env of [
        { SCRYBE_SCREENSHOT_PAGE: "../home" },
        { SCRYBE_SCREENSHOT_LOCALE: "fr" },
        { SCRYBE_SCREENSHOT_WIDTH: "879" },
        { SCRYBE_SCREENSHOT_HEIGHT: "559" },
        { SCRYBE_SCREENSHOT_WIDTH: "1000.2" },
        { SCRYBE_SCREENSHOT_WIDTH: "1e3" },
        { SCRYBE_SCREENSHOT_HEIGHT: "20000" },
    ])
        assert.throws(() => optionsFromEnv(env));
});

test("PNG validation rejects bad CRC, truncation, invalid scanlines and trailing data", () => {
    assert.deepEqual(validatePng(png()), { width: 1, height: 1 });
    const bad = png();
    bad[bad.length - 1] ^= 1;
    for (const bytes of [
        Buffer.from("not a PNG"),
        bad,
        png().subarray(0, -2),
        Buffer.concat([png(), Buffer.from("junk")]),
    ])
        assert.throws(() => validatePng(bytes), /PNG/);
    const header = png().subarray(8, 33);
    for (const scanline of [
        Buffer.from([5, 0, 0, 0, 255]),
        Buffer.from([0, 0]),
    ]) {
        const bytes = Buffer.concat([
            png().subarray(0, 8),
            header,
            chunk("IDAT", deflateSync(scanline)),
            chunk("IEND", Buffer.alloc(0)),
        ]);
        assert.throws(() => validatePng(bytes), /PNG/);
    }
});

test("first update archives legacy image, preserves source, logo and height; repeated update is a no-op", async (t) => {
    const { root, image, readme: originalReadme } = await fixture(t);
    const first = await updateReadme(image, {
        root,
        now: new Date("2026-10-16T12:34:56Z"),
    });
    assert.equal(first.changed, true);
    assert.equal(await readFile(first.archive, "hex"), png(1).toString("hex"));
    assert.equal(await readFile(first.image, "hex"), png(2).toString("hex"));
    assert.equal(await readFile(image, "hex"), png(2).toString("hex"));
    const readme = await readFile(join(root, "README.md"), "utf8");
    assert.equal(
        readme,
        originalReadme.replace(
            "screenshots/legacy.png",
            "screenshots/scrybe.png",
        ),
    );
    assert.match(readme, /src="screenshots\/scrybe.png" height="500"/);
    assert.match(readme, /src="screenshots\/logo.png" height="180"/);
    assert.deepEqual(await updateReadme(image, { root }), { changed: false });
    assert.equal(
        (await readdir(join(root, "screenshots", "archive"))).length,
        1,
    );
    assert.deepEqual((await readdir(join(root, "screenshots"))).sort(), [
        "archive",
        "logo.png",
        "scrybe.png",
    ]);
});

test("subsequent updates archive the stable image with collision-safe UTC names", async (t) => {
    const { root, image } = await fixture(t);
    const now = new Date("2026-10-16T12:34:56Z");
    await updateReadme(image, { root, now });
    await writeFile(image, png(3));
    const second = await updateReadme(image, { root, now });
    await writeFile(image, png(4));
    const third = await updateReadme(image, { root, now });
    assert.notEqual(second.archive, third.archive);
    assert.match(third.archive, /-scrybe-1.png$/);
    assert.equal(await readFile(second.archive, "hex"), png(2).toString("hex"));
    assert.equal(await readFile(third.archive, "hex"), png(3).toString("hex"));
});

test("identical legacy content does not archive or rewrite the reference", async (t) => {
    const { root, readme } = await fixture(t);
    assert.deepEqual(
        await updateReadme(join(root, "screenshots", "legacy.png"), { root }),
        { changed: false },
    );
    assert.equal(await readFile(join(root, "README.md"), "utf8"), readme);
    assert.deepEqual((await readdir(join(root, "screenshots"))).sort(), [
        "legacy.png",
        "logo.png",
    ]);
});

for (const phase of ["staged", "archived", "image", "readme"]) {
    test(`failure at ${phase} restores README and images`, async (t) => {
        const { root, image, readme } = await fixture(t);
        await assert.rejects(
            updateReadme(image, {
                root,
                checkpoint: async (current) => {
                    if (current === phase)
                        throw new Error("Injected I/O failure");
                },
            }),
            /Injected/,
        );
        assert.equal(await readFile(join(root, "README.md"), "utf8"), readme);
        assert.equal(
            await readFile(join(root, "screenshots", "legacy.png"), "hex"),
            png(1).toString("hex"),
        );
        assert.deepEqual((await readdir(join(root, "screenshots"))).sort(), [
            "archive",
            "legacy.png",
            "logo.png",
        ]);
        assert.deepEqual(
            await readdir(join(root, "screenshots", "archive")),
            [],
        );
    });
}

test("invalid images, missing markers, ambiguous markers and unsafe references leave files intact", async (t) => {
    const { root, image, readme } = await fixture(t);
    await assert.rejects(updateReadme("", { root }), /Supply IMAGE/);
    await writeFile(image, Buffer.from("invalid"));
    await assert.rejects(updateReadme(image, { root }), /PNG/);
    assert.equal(await readFile(join(root, "README.md"), "utf8"), readme);
    await writeFile(image, png());
    for (const content of [
        readme.replace("scrybe-main-screenshot", "other"),
        readme + readme,
        readme.replace("screenshots/legacy.png", "../outside.png"),
    ]) {
        await writeFile(join(root, "README.md"), content);
        await assert.rejects(updateReadme(image, { root }));
        assert.equal(await readFile(join(root, "README.md"), "utf8"), content);
        assert.deepEqual((await readdir(join(root, "screenshots"))).sort(), [
            "legacy.png",
            "logo.png",
        ]);
    }
});

test("updater refuses concurrent updates and unrelated stable images", async (t) => {
    const { root, image, readme } = await fixture(t);
    const lock = join(root, "screenshots", ".readme-update.lock");
    await writeFile(lock, "owned by other run");
    await assert.rejects(updateReadme(image, { root }), /Another update/);
    assert.equal(await readFile(lock, "utf8"), "owned by other run");
    await rm(lock);
    await writeFile(join(root, "screenshots", "scrybe.png"), png(8));
    await assert.rejects(updateReadme(image, { root }), /already exists/);
    assert.equal(await readFile(join(root, "README.md"), "utf8"), readme);
    assert.equal(
        await readFile(join(root, "screenshots", "scrybe.png"), "hex"),
        png(8).toString("hex"),
    );
});

test("profile isolation preserves the user home and disables internal builds", () => {
    const env = profileEnvironment(
        "/tmp/test profile",
        "com.scrybe.screenshot.test",
        "linux",
        {
            HOME: "/real/home",
            ENABLE_INTERNAL: "1",
            TAURI_CONFIG: "foreign",
            GTK_MODULES: "existing",
        },
    );
    assert.equal(env.HOME, "/real/home");
    assert.equal(env.ENABLE_INTERNAL, undefined);
    assert.equal(env.TAURI_CONFIG, undefined);
    assert.equal(env.XDG_CONFIG_HOME, join("/tmp/test profile", "config"));
    assert.match(env.GTK_MODULES, /existing:atk-bridge/);
    for (const path of profilePaths("com.scrybe.screenshot.test", "darwin"))
        assert.match(path, /com.scrybe.screenshot.test/);
    assert.deepEqual(
        profilePaths("com.scrybe.screenshot.test", "win32", {
            APPDATA: "roaming",
            LOCALAPPDATA: "local",
        }),
        [
            join("roaming", "com.scrybe.screenshot.test"),
            join("local", "com.scrybe.screenshot.test"),
        ],
    );
});

test("portable command runner passes spaced paths literally and reports failures/timeouts/interruption", async (t) => {
    const { root } = await fixture(t);
    const file = join(root, "literal file.txt");
    const value = 'spaces $() `literal` "quotes"';
    await command(
        process.execPath,
        [
            "-e",
            'require("fs").writeFileSync(process.argv[1],process.argv[2])',
            file,
            value,
        ],
        { cwd: root },
    ).completion;
    assert.equal(await readFile(file, "utf8"), value);
    await assert.rejects(
        command(process.execPath, ["-e", "process.exit(7)"]).completion,
        /exited 7/,
    );
    await assert.rejects(
        command(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
            timeout: 80,
        }).completion,
        /timed out/,
    );
    const controller = new AbortController();
    const running = command(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)"],
        { signal: controller.signal },
    );
    controller.abort(new Error("Test interrupted"));
    await assert.rejects(running.completion, /Test interrupted/);
    await stopProcess(running.child);
    const failedLog = command(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)"],
        { log: root },
    );
    await assert.rejects(failedLog.completion, /EISDIR|EACCES|EPERM/);
    await stopProcess(failedLog.child);
});

test("occupied port is rejected without stopping the existing server", async (t) => {
    const server = createServer();
    const bound = await new Promise((accept, reject) => {
        server.once("error", (error) =>
            error.code === "EADDRINUSE" ? accept(false) : reject(error),
        );
        server.listen(3030, "127.0.0.1", () => accept(true));
    });
    if (bound) t.after(() => new Promise((accept) => server.close(accept)));
    await assert.rejects(checkPort(), /3030 is unavailable/);
    if (bound) assert.equal(server.listening, true);
});

test("accessibility labels are resolved from both message catalogs", async () => {
    const result = await labels();
    assert.equal(result.en.navigation.home, "Live captions");
    assert.equal(result.ru.navigation.home, "Живые субтитры");
    for (const copy of Object.values(result)) {
        assert.equal(Object.keys(copy.ready).length, 4);
        assert.ok(Object.values(copy.ready).every(Boolean));
        assert.ok(copy.loading.every(Boolean));
    }
});

test("generation CLI rejects invalid arguments before creating artifacts or changing README", async () => {
    const before = await readFile(join(ROOT, "README.md"));
    const result = spawnSync(
        process.execPath,
        [join(ROOT, "scripts/screenshots/run.mjs")],
        {
            env: { ...process.env, SCRYBE_SCREENSHOT_PAGE: "invalid" },
            encoding: "utf8",
        },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid PAGE/);
    assert.deepEqual(await readFile(join(ROOT, "README.md")), before);
});

test("missing native prerequisites retain diagnostics and leave repository images intact", async (t) => {
    const { root, readme } = await fixture(t);
    await assert.rejects(
        capture(optionsFromEnv({}), {
            root,
            platform: "linux",
            env: { SCRYBE_SCREENSHOT_PYTHON: join(root, "missing-python") },
        }),
        /ENOENT/,
    );
    assert.equal(await readFile(join(root, "README.md"), "utf8"), readme);
    assert.deepEqual((await readdir(join(root, "screenshots"))).sort(), [
        "legacy.png",
        "logo.png",
    ]);
    const [run] = await readdir(join(root, "target", "screenshots"));
    assert.deepEqual(await readdir(join(root, "target", "screenshots", run)), [
        "preflight.log",
    ]);
});

test("interruption stops the owned process tree", async (t) => {
    const { root } = await fixture(t);
    const heartbeat = join(root, "heartbeat.txt");
    const code =
        'const {spawn}=require("child_process"); spawn(process.execPath,["-e",process.argv[2],process.argv[1]],{stdio:"inherit"}); setInterval(()=>{},1000)';
    const descendant =
        'const fs=require("fs"); setInterval(()=>fs.appendFileSync(process.argv[1],"."),20)';
    const owned = command(
        process.execPath,
        ["-e", code, heartbeat, descendant],
        { background: true },
    );
    t.after(() => stopProcess(owned.child));
    const deadline = Date.now() + 5000;
    while (true) {
        try {
            if ((await readFile(heartbeat)).length) break;
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
        if (Date.now() > deadline) throw new Error("Descendant did not start");
        await new Promise((accept) => setTimeout(accept, 20));
    }
    await stopProcess(owned.child);
    await owned.completion.catch(() => {});
    const stopped = await readFile(heartbeat, "utf8");
    await new Promise((accept) => setTimeout(accept, 200));
    assert.equal(await readFile(heartbeat, "utf8"), stopped);
});

test("KWin script parses and scopes geometry operations to the owned window", async () => {
    const source = await readFile(
        join(ROOT, "scripts/screenshots/kwin.js"),
        "utf8",
    );
    const foreign = {
        pid: 41,
        setMaximize() {
            throw new Error("Foreign window touched");
        },
    };
    const window = {
        pid: 42,
        frameGeometry: { x: 0, y: 0, width: 1300, height: 930 },
        clientGeometry: { x: 0, y: 30, width: 1300, height: 900 },
        output: { devicePixelRatio: 1.5 },
        setMaximize() {},
    };
    const workspace = {
        windowList: () => [foreign, window],
        clientArea: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
        activeWindow: foreign,
    };
    for (const resize of [true, false]) {
        let reply;
        const script = new Script(
            source.replace(
                "__CONFIG__",
                JSON.stringify({
                    pid: 42,
                    width: 1300,
                    height: 900,
                    resize,
                    busName: "org.scrybe.Test",
                }),
            ),
        );
        script.runInNewContext({
            workspace,
            KWin: { PlacementArea: 0 },
            callDBus: (...args) => {
                reply = JSON.parse(args.at(-1));
            },
        });
        assert.equal(reply.active, true);
        assert.equal(reply.content.width, 1300);
        assert.equal(reply.frame.height, 930);
        assert.equal(reply.scale, 1.5);
    }
});
