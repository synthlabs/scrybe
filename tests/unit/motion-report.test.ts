import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const motionReport = fileURLToPath(
    new URL("../../scripts/diagnostics/motion-report.mjs", import.meta.url),
);

test("motion report reads WebKit case and native motion reports", () => {
    const artifacts = mkdtempSync(join(tmpdir(), "motion-report-"));
    try {
        const report = {
            id: 0,
            options: {},
            viewport: [1300, 900],
            errors: [],
            transitions: [
                {
                    label: "change-model-open",
                    frames: [{ height: 0 }, { height: 480 }],
                },
            ],
        };
        for (const name of ["case-0.json", "native-0.json"])
            writeFileSync(join(artifacts, name), JSON.stringify(report));
        const result = spawnSync(
            process.execPath,
            [motionReport, artifacts, "--summary"],
            { encoding: "utf8" },
        );
        assert.equal(result.status, 0, result.stderr);
        for (const name of ["case-0.json", "native-0.json"])
            assert.match(
                result.stdout,
                new RegExp(`^${name} viewport=1300,900 errors=\\[\\]$`, "m"),
            );
        assert.match(result.stdout, /^change-model-open: height 0 → 480$/m);
    } finally {
        rmSync(artifacts, { recursive: true, force: true });
    }
});
