import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
            $utils: fileURLToPath(new URL("./utils/js", import.meta.url)),
        },
    },
    test: {
        environment: "node",
        include: ["tests/unit/**/*.test.ts"],
        pool: "forks",
        fileParallelism: false,
        maxWorkers: 1,
        retry: 0,
        clearMocks: true,
        restoreMocks: true,
        unstubGlobals: true,
        unstubEnvs: true,
        reporters: ["default", "json"],
        outputFile: { json: "target/test-results/vitest.json" },
    },
});
