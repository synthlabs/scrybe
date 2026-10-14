import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
    options: {
        binary: { type: "string", default: "target/release/scrybe.exe" },
        "staged-dir": {
            type: "string",
            default: "target/windows-cuda-redist/resources/cuda",
        },
        hook: {
            type: "string",
            default: "target/windows-cuda-redist/cuda-redist-hooks.nsh",
        },
    },
});

if (process.platform !== "win32")
    throw new Error(
        "Built CUDA artifact checks require Windows, PowerShell, a built Scrybe executable and staged CUDA resources.",
    );
const root = fileURLToPath(new URL("../../", import.meta.url));
for (const [script, arguments_] of [
    ["cuda-imports.test.ps1", ["-ExePath", values.binary]],
    [
        "windows-cuda-redist.test.ps1",
        [
            "-BinaryPath",
            values.binary,
            "-StagedDir",
            values["staged-dir"],
            "-HookPath",
            values.hook,
        ],
    ],
]) {
    const result = spawnSync(
        "powershell.exe",
        [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            fileURLToPath(new URL(script, import.meta.url)),
            ...arguments_,
        ],
        { cwd: root, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}
