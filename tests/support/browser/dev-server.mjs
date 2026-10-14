import { realpathSync } from "node:fs";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const { values } = parseArgs({
    options: {
        host: { type: "string", default: "127.0.0.1" },
        port: { type: "string", default: "0" },
    },
});
const server = await createServer({
    cacheDir: "target/test-results/vite-cache",
    server: {
        host: values.host,
        port: Number(values.port),
        strictPort: true,
        hmr: false,
        watch: null,
        fs: { allow: [process.cwd(), realpathSync("node_modules")] },
    },
});
await new Promise((resolve, reject) => {
    server.httpServer.once("error", reject);
    server.httpServer.listen(Number(values.port), values.host, resolve);
});
const address = server.httpServer.address();
if (!address || typeof address === "string") {
    await server.close();
    throw new Error("Browser test server did not bind a TCP port");
}
console.log(`Scrybe browser port ${address.port}`);
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
        void server.close().finally(() => process.exit(0));
    });
}
