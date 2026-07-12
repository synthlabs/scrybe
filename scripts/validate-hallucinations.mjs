import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "target", "scrybe-hallucination-validation");
const model = process.env.SCRYBE_TEST_MODEL;
const vadModel = process.env.SCRYBE_TEST_VAD_MODEL;
const useGpu = ["1", "true"].includes(
    process.env.SCRYBE_TEST_GPU?.toLowerCase() ?? "",
);
const cargoFeatures =
    process.env.SCRYBE_TEST_FEATURES ??
    (useGpu && process.platform === "win32"
        ? "whisper-runtime,cuda"
        : useGpu && process.platform === "darwin"
          ? "whisper-runtime,coreml,metal"
          : "whisper-runtime");
const sampleRate = 16_000;
const publicDimaUrl =
    "https://github.com/user-attachments/files/23571343/dima_clip.wav";
const publicDimaSha256 =
    "11f67e74f3ced50696c313dcc2d99084f25563866aed8c16ba59139a131ac808";

if (!model || !vadModel) {
    console.error(
        "Set SCRYBE_TEST_MODEL and SCRYBE_TEST_VAD_MODEL to local whisper.cpp and Silero GGML models.",
    );
    process.exit(2);
}

mkdirSync(outputDir, { recursive: true });

let randomState = 0x5c12beef;
const random = () => {
    randomState = (1664525 * randomState + 1013904223) >>> 0;
    return randomState / 0x1_0000_0000;
};

const makeSamples = (seconds, generator) =>
    Array.from({ length: seconds * sampleRate }, (_, index) =>
        Math.max(-1, Math.min(1, generator(index))),
    );

const cases = [
    {
        name: "silence",
        samples: makeSamples(5, () => 0),
        expectedEmpty: true,
    },
    {
        name: "hum_and_room_noise",
        samples: makeSamples(8, (index) => {
            const hum =
                Math.sin((2 * Math.PI * 60 * index) / sampleRate) * 0.015;
            return hum + (random() * 2 - 1) * 0.008;
        }),
        expectedEmpty: true,
    },
    {
        name: "steady_tone",
        samples: makeSamples(
            5,
            (index) =>
                Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.02,
        ),
        expectedEmpty: true,
    },
    {
        name: "click_bursts",
        samples: makeSamples(5, (index) =>
            index % (sampleRate / 2) < sampleRate / 100 ? 0.12 : 0,
        ),
        expectedEmpty: true,
    },
];

const basicSpeech = readPcm16Wav(
    join(root, "fixtures", "transcription", "basic_en_short.wav"),
);
const ambientTail = makeSamples(5, (index) => {
    const hum = Math.sin((2 * Math.PI * 60 * index) / sampleRate) * 0.012;
    return hum + (random() * 2 - 1) * 0.006;
});
cases.push({
    name: "speech_with_ambient_tail",
    samples: [...basicSpeech.samples, ...ambientTail],
    expectedContains: "validates local captions",
});

for (const testCase of cases) {
    const audioPath = join(outputDir, `${testCase.name}.wav`);
    writePcm16Wav(audioPath, testCase.samples, sampleRate);
    testCase.audioPath = audioPath;
}

const publicDimaPath = join(outputDir, "dima_clip.wav");
downloadPublicFixture(publicDimaUrl, publicDimaPath, publicDimaSha256);
cases.push({
    name: "public_dima_clip",
    audioPath: publicDimaPath,
    forbidden: [
        "subtitles by dima",
        "субтитры сделал dimatorzok",
        "субтитры создавал dimatorzok",
        "продолжение следует",
    ],
});

let failed = false;
for (const testCase of cases) {
    const outputPath = join(outputDir, `${testCase.name}.actual.json`);
    const result = spawnSync(
        "cargo",
        [
            "run",
            "-p",
            "scrybe_core",
            "--bin",
            "transcribe_fixture",
            "--features",
            cargoFeatures,
            "--",
            "--model",
            model,
            ...(useGpu ? ["--gpu"] : []),
            "--vad-model",
            vadModel,
            "--audio",
            testCase.audioPath,
            "--protection",
            "--vad-sensitivity",
            "balanced",
            "--incremental-step-ms",
            "500",
            "--output",
            outputPath,
        ],
        { cwd: root, stdio: "inherit" },
    );

    if (result.status !== 0) {
        failed = true;
        continue;
    }

    const report = JSON.parse(readFileSync(outputPath, "utf8"));
    const normalized = report.validation.normalized_text;
    if (testCase.expectedEmpty && normalized !== "") {
        console.error(
            `${testCase.name}: expected no displayed text, got ${normalized}`,
        );
        failed = true;
    }
    if (
        testCase.expectedContains &&
        !normalized.includes(testCase.expectedContains)
    ) {
        console.error(
            `${testCase.name}: expected displayed text to contain ${testCase.expectedContains}, got ${normalized}`,
        );
        failed = true;
    }
    for (const phrase of testCase.forbidden ?? []) {
        if (normalized.includes(phrase)) {
            console.error(
                `${testCase.name}: displayed forbidden phrase ${phrase}`,
            );
            failed = true;
        }
    }
}

process.exit(failed ? 1 : 0);

function downloadPublicFixture(url, destination, expectedSha256) {
    if (!existsSync(destination)) {
        const data = execFileSync("gh", ["api", url], {
            cwd: root,
            encoding: "buffer",
            maxBuffer: 1024 * 1024,
        });
        writeFileSync(destination, data);
    }

    const actual = createHash("sha256")
        .update(readFileSync(destination))
        .digest("hex");
    if (actual !== expectedSha256) {
        throw new Error(
            `public fixture checksum mismatch for ${destination}: expected ${expectedSha256}, got ${actual}`,
        );
    }
}

function writePcm16Wav(path, samples, rate) {
    const dataSize = samples.length * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(rate, 24);
    buffer.writeUInt32LE(rate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);
    samples.forEach((sample, index) => {
        const scaled = Math.round(Math.max(-1, Math.min(1, sample)) * 32767);
        buffer.writeInt16LE(scaled, 44 + index * 2);
    });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buffer);
}

function readPcm16Wav(path) {
    const buffer = readFileSync(path);
    if (buffer.toString("ascii", 0, 4) !== "RIFF") {
        throw new Error(`${path} is not a RIFF WAV`);
    }

    let offset = 12;
    let format;
    let data;
    while (offset + 8 <= buffer.length) {
        const id = buffer.toString("ascii", offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const start = offset + 8;
        if (id === "fmt ") {
            format = {
                encoding: buffer.readUInt16LE(start),
                channels: buffer.readUInt16LE(start + 2),
                sampleRate: buffer.readUInt32LE(start + 4),
                bitsPerSample: buffer.readUInt16LE(start + 14),
            };
        } else if (id === "data") {
            data = buffer.subarray(start, start + size);
        }
        offset = start + size + (size % 2);
    }

    if (
        !format ||
        !data ||
        format.encoding !== 1 ||
        format.channels !== 1 ||
        format.bitsPerSample !== 16
    ) {
        throw new Error(`${path} must be mono PCM16 for this validation`);
    }

    const samples = Array.from(
        { length: data.length / 2 },
        (_, index) => data.readInt16LE(index * 2) / 32767,
    );
    return {
        samples:
            format.sampleRate === sampleRate
                ? samples
                : resampleLinear(samples, format.sampleRate, sampleRate),
    };
}

function resampleLinear(samples, sourceRate, targetRate) {
    const outputLength = Math.round((samples.length * targetRate) / sourceRate);
    return Array.from({ length: outputLength }, (_, index) => {
        const sourcePosition = (index * sourceRate) / targetRate;
        const left = Math.floor(sourcePosition);
        const right = Math.min(left + 1, samples.length - 1);
        const fraction = sourcePosition - left;
        return samples[left] * (1 - fraction) + samples[right] * fraction;
    });
}
