import { realpathSync } from "node:fs";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const { values } = parseArgs({
    options: {
        host: { type: "string", default: "127.0.0.1" },
        port: { type: "string", default: "1420" },
        strictPort: { type: "boolean", default: true },
    },
});
const server = await createServer({
    server: {
        host: values.host,
        port: Number(values.port),
        strictPort: values.strictPort,
        fs: { allow: [process.cwd(), realpathSync("node_modules")] },
    },
});
await server.listen();
