import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const webDir = dirname(fileURLToPath(import.meta.url));
const upstreamWebDir = "/Users/zhaochenyu/Desktop/C_code/infinite-canvas-main/web";

function upstreamAliasPlugin(): Plugin {
    return {
        name: "infinite-canvas-upstream-alias",
        enforce: "pre",
        async resolveId(source, importer) {
            if (importer?.startsWith(upstreamWebDir) && source === "next/navigation") {
                return resolve(webDir, "src/shims/next-navigation.ts");
            }
            if (importer?.startsWith(upstreamWebDir) && source === "next/dynamic") {
                return resolve(webDir, "src/shims/next-dynamic.tsx");
            }
            if (importer?.startsWith(upstreamWebDir) && source.startsWith("@/")) {
                return this.resolve(resolve(upstreamWebDir, "src", source.slice(2)), importer, { skipSelf: true });
            }
            const localSourcePrefix = resolve(webDir, "src") + "/";
            if (importer?.startsWith(upstreamWebDir) && source.startsWith(localSourcePrefix)) {
                if (source.endsWith("/services/api/agent-skills")) {
                    return this.resolve(resolve(webDir, "src/services/api/agent-skills"), importer, { skipSelf: true });
                }
                if (source.endsWith("/services/api/prompts")) {
                    return this.resolve(resolve(webDir, "src/services/api/prompts"), importer, { skipSelf: true });
                }
                return this.resolve(resolve(upstreamWebDir, "src", source.slice(localSourcePrefix.length)), importer, { skipSelf: true });
            }
            return null;
        },
    };
}

// Dev-server forward proxy for CORS-blocked API targets (relay/中转 API providers usually
// do not send CORS headers). Frontend calls /api-proxy?target=<full api url>; this middleware
// forwards the request server-side and streams the response back, bypassing browser CORS.
function apiProxyPlugin(): Plugin {
    return {
        name: "canvas-api-proxy",
        apply: "serve",
        configureServer(server) {
            server.middlewares.use("/api-proxy", (req, res, next) => {
                void (async () => {
                    try {
                        const url = new URL(req.url || "", "http://localhost");
                        const target = url.searchParams.get("target");
                        if (!target) {
                            res.statusCode = 400;
                            res.end("missing target");
                            return;
                        }
                        const targetUrl = new URL(target);
                        const headers: Record<string, string> = {};
                        for (const [key, value] of Object.entries(req.headers)) {
                            if (!value || ["host", "connection", "content-length", "transfer-encoding"].includes(key)) continue;
                            headers[key] = Array.isArray(value) ? value.join(", ") : value;
                        }
                        headers.host = targetUrl.host;
                        const body = ["POST", "PUT", "PATCH"].includes(req.method || "") ? await readRequestBody(req) : undefined;
                        const upstream = await fetch(targetUrl, {
                            method: req.method,
                            headers,
                            body: body ? new Uint8Array(body) : undefined,
                            signal: AbortSignal.timeout(300_000),
                        });
                        res.statusCode = upstream.status;
                        upstream.headers.forEach((value, key) => {
                            if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(key)) res.setHeader(key, value);
                        });
                        if (upstream.body) {
                            const stream = Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream);
                            stream.pipe(res);
                        } else {
                            res.end();
                        }
                    } catch (error) {
                        res.statusCode = 502;
                        res.end(`proxy error: ${error instanceof Error ? error.message : String(error)}`);
                    }
                })();
            });
        },
    };
}

function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
    return new Promise((resolveBody) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolveBody(chunks.length ? Buffer.concat(chunks) : undefined));
        req.on("error", () => resolveBody(undefined));
    });
}

export default defineConfig({
    // 以相对路径构建，产物由宿主(Vue)项目挂在 /atelier-canvas/ 下静态伺服
    base: process.env.VITE_BASE || "./",
    plugins: [upstreamAliasPlugin(), react(), apiProxyPlugin()],
    resolve: {
        dedupe: ["react", "react-dom", "react-router-dom", "antd", "@ant-design/icons", "@tanstack/react-query", "motion"],
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    build: {
        // 直接产出进宿主 public 目录，随宿主构建一起进 dist
        outDir: resolve(webDir, "../public/atelier-canvas"),
        emptyOutDir: true,
    },
});
