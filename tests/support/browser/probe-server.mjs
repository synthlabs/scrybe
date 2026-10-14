import { realpathSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
const { createServer } = await import(
    pathToFileURL(
        join(
            realpathSync(join(config.root, "node_modules/vite")),
            "dist/node/index.js",
        ),
    ).href
);
const identity = { ...config.identity };
const server = await createServer({
    root: config.root,
    cacheDir: join(config.artifacts, "vite-cache"),
    server: {
        host: "127.0.0.1",
        port: identity.port,
        strictPort: true,
        hmr: false,
        watch: null,
        fs: {
            allow: [
                config.root,
                realpathSync(join(config.root, "node_modules")),
                config.artifacts,
            ],
        },
    },
    plugins: [
        {
            name: "scrybe-test-probe",
            enforce: "pre",
            load(id) {
                if (
                    config.previewSource &&
                    id ===
                        join(
                            config.root,
                            "src/lib/components/overlay/preview-frame.svelte",
                        )
                )
                    return readFileSync(config.previewSource, "utf8");
            },
            configureServer(server) {
                server.middlewares.use((request, response, next) => {
                    const url = new URL(request.url, "http://127.0.0.1");
                    if (url.pathname === "/__motion_probe__/identity") {
                        response.setHeader("Content-Type", "application/json");
                        response.end(JSON.stringify(identity));
                    } else if (
                        url.pathname === "/__motion_probe__/result" &&
                        request.method === "POST" &&
                        url.searchParams.get("token") === identity.token
                    ) {
                        let body = "";
                        request.on("data", (chunk) => {
                            body += chunk;
                        });
                        request.on("end", () => {
                            try {
                                const report = JSON.parse(body);
                                if (
                                    !Number.isInteger(report.id) ||
                                    report.id < 0 ||
                                    report.id >= config.caseCount
                                )
                                    throw new Error("Invalid case ID");
                                writeFileSync(
                                    join(
                                        config.artifacts,
                                        "native-" + report.id + ".json",
                                    ),
                                    JSON.stringify(report, null, 2),
                                );
                                response.end("ok");
                            } catch (error) {
                                response.statusCode = 400;
                                response.end(String(error));
                            }
                        });
                    } else {
                        if (
                            config.bootstrap &&
                            request.headers.accept?.includes("text/html")
                        ) {
                            const chunks = [];
                            const end = response.end.bind(response);
                            const writeHead = response.writeHead.bind(response);
                            let head;
                            response.writeHead = (...args) => {
                                head = args;
                                return response;
                            };
                            response.write = (chunk, encoding, callback) => {
                                chunks.push(
                                    Buffer.isBuffer(chunk)
                                        ? chunk
                                        : Buffer.from(
                                              chunk,
                                              typeof encoding === "string"
                                                  ? encoding
                                                  : undefined,
                                          ),
                                );
                                if (typeof encoding === "function") encoding();
                                if (typeof callback === "function") callback();
                                return true;
                            };
                            response.end = (chunk, encoding, callback) => {
                                if (chunk)
                                    chunks.push(
                                        Buffer.isBuffer(chunk)
                                            ? chunk
                                            : Buffer.from(chunk),
                                    );
                                let html = Buffer.concat(chunks).toString();
                                html = html.replace(
                                    "</head>",
                                    "<script>localStorage.setItem('PARAGLIDE_LOCALE'," +
                                        JSON.stringify(config.locale) +
                                        ");</script></head>",
                                );
                                html = html.replace(
                                    "</body>",
                                    '<script id="motion-probe-bootstrap" type="module">' +
                                        config.bootstrap +
                                        "</script></body>",
                                );
                                response.removeHeader("Content-Length");
                                if (head) writeHead(...head);
                                return end(
                                    html,
                                    typeof encoding === "function"
                                        ? encoding
                                        : callback,
                                );
                            };
                        }
                        next();
                    }
                });
            },
        },
    ],
});
await new Promise((resolve, reject) => {
    server.httpServer.once("error", reject);
    server.httpServer.listen(identity.port, "127.0.0.1", resolve);
});
identity.port = server.httpServer.address().port;
console.log("motion-probe-ready " + JSON.stringify(identity));
for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
        void server.close().finally(() => process.exit(0));
    });
