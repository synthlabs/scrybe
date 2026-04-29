import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const model = process.env.SCRYBE_TEST_MODEL;
const updateGoldens = process.env.UPDATE_GOLDENS === "1";

const cases = [
    {
        name: "basic_en_short",
        audio: "fixtures/transcription/basic_en_short.wav",
        expected: "fixtures/transcription/basic_en_short.expected.json",
    },
];

if (!model) {
    console.error("Set SCRYBE_TEST_MODEL to a local whisper.cpp model before running validation.");
    process.exit(2);
}

let failed = false;

for (const testCase of cases) {
    const audioPath = join(root, testCase.audio);
    const expectedPath = join(root, testCase.expected);
    const actualPath = join(root, "target", "scrybe-validation", `${testCase.name}.actual.json`);
    mkdirSync(dirname(actualPath), { recursive: true });

    const args = [
        "run",
        "-p",
        "scrybe_core",
        "--bin",
        "transcribe_fixture",
        "--",
        "--model",
        model,
        "--audio",
        audioPath,
        "--output",
        actualPath,
    ];

    if (!updateGoldens) {
        args.push("--expected", expectedPath);
    }

    const result = spawnSync("cargo", args, {
        cwd: root,
        stdio: "inherit",
    });

    if (result.status !== 0) {
        failed = true;
        continue;
    }

    if (updateGoldens) {
        const actual = JSON.parse(readFileSync(actualPath, "utf8"));
        const nextExpected = {
            params: actual.params,
            normalized_text: actual.normalized_text,
            max_word_error_rate: 0.35,
            min_segments: 1,
            max_segments: null,
        };
        writeFileSync(expectedPath, `${JSON.stringify(nextExpected, null, 4)}\n`);
        console.log(`updated ${testCase.expected} from ${basename(actualPath)}`);
    }
}

process.exit(failed ? 1 : 0);
