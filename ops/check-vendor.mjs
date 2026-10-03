#!/usr/bin/env node
/**
 * vendor 适配器自检器（零依赖、零花费）
 * =====================================================================
 * 作用：在**不连线上 new-api、不花一分钱**的前提下，验证 `backend/data/vendor/*.ts`
 *       能不能被平台正常加载、以及它发出的请求体是否长得对。
 *
 * 它做三件事：
 *   1. 用 esbuild 把 TS 转成 JS（与 backend/src/utils/vm.ts 的做法一致：去掉 `export {}`）
 *   2. 在一个 node:vm 上下文里执行，**沙箱全局与后端 vm.ts 逐项对齐**
 *   3. 起一个本地「假 new-api」，把 axios 指过去，真跑一遍
 *      text / image（含参考图 images[]）/ video（/v1/videos 三件套 + 成片下载）/ tts
 *
 * ⚠️ 假网关与断言必须与 backend/data/vendor/newapi.ts 的**造物契约**一致：
 *    视频 = POST /v1/videos → GET /v1/videos/{id} → GET /v1/videos/{id}/content（二进制 mp4）
 *    参考图 = /v1/images/generations 的 images[]（**不走** multipart /images/edits）
 *    改了适配器的端点，这里要同步改，否则自检会报「假失败」。
 *
 * 用法：
 *   node ops/check-vendor.mjs                       # 检查 newapi 适配器（含假网关实跑）
 *   node ops/check-vendor.mjs openai                # 检查其它 vendor
 *   node ops/check-vendor.mjs newapi --no-mock      # 只做结构与加载检查
 *
 * 退出码：0 全通过 / 1 有失败项
 */
import http from "node:http";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const VENDOR_DIR = path.join(ROOT, "backend", "data", "vendor");
const CONSOLE_DIR = path.join(ROOT, "frontend", "console");

const target = process.argv[2] || "newapi";
const useMock = !process.argv.includes("--no-mock");
const file = path.join(VENDOR_DIR, `${target}.ts`);

const results = [];
const pass = (name, extra = "") => results.push({ level: "pass", name, extra });
const warn = (name, extra = "") => results.push({ level: "warn", name, extra });
const fail = (name, extra = "") => results.push({ level: "fail", name, extra });

/**
 * 判定口径（很重要）：
 *   · fail  只用于「这个适配器根本跑不起来」的情况：编译失败、拿不到 vendor 配置、models 不是数组、
 *           一个 request 函数都没导出。这些是真问题。
 *   · warn  用于「这个供应商本来就不提供这项能力」：比如 vidu 是纯视频供应商，
 *           没有 version 字段、也没有 ttsRequest —— 那是正常的，不该判失败。
 * 需要严格模式（四项能力都必须有）时加 --strict。
 */
const strict = process.argv.includes("--strict");

/* ------------------------------------------------------------------ */
/* 1. 取 esbuild（vite 的依赖里就有，避免为脚本再装一个包）              */
/* ------------------------------------------------------------------ */
async function loadEsbuild() {
    const candidates = [CONSOLE_DIR, ROOT, path.join(ROOT, "frontend")];
    for (const base of candidates) {
        try {
            const req = createRequire(path.join(base, "package.json"));
            return await import(req.resolve("esbuild"));
        } catch {
            /* 换下一个 */
        }
    }
    throw new Error("找不到 esbuild（先装 frontend/console 的依赖即可）");
}

/* ------------------------------------------------------------------ */
/* 2. 与 backend/src/utils/vm.ts 对齐的沙箱全局                         */
/* ------------------------------------------------------------------ */
function buildSandbox(overrides = {}) {
    const exportsObj = {};
    const sandbox = {
        // —— 与 vm.ts 一致：这些在真环境里由后端注入 ——
        axios: null, // 由调用方注入
        FormData: null, // 由调用方注入
        logger: (m) => process.stdout.write(`      [vendor] ${m}\n`),
        createOpenAI: () => ({ chat: (m) => ({ __fake: m }) }),
        createOpenAICompatible: () => ({ chat: (m) => ({ __fake: m }) }),
        zipImage: async (b64) => b64,
        zipImageResolution: async (b64) => b64,
        urlToBase64: async (url) => `data:image/png;base64,STUB(${url})`,
        mergeImages: async () => "",
        pollTask: null, // 由调用方注入
        fetch,
        exports: exportsObj,
        Buffer,
        URL,
        URLSearchParams,
        crypto,
        console,
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval,
        Promise,
        Date,
        JSON,
        Math,
        RegExp,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Error,
        TypeError,
        RangeError,
        SyntaxError,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
        btoa: (s) => Buffer.from(s).toString("base64"),
        atob: (s) => Buffer.from(s, "base64").toString(),
        ...overrides,
    };
    return { sandbox, exportsObj };
}

/** 与 vm.ts 一致的 pollTask：轮询到 completed 或超时 */
function makePollTask() {
    return async (fn, interval = 5000, timeout = 3600000) => {
        const started = Date.now();
        for (;;) {
            const r = await fn();
            if (r && r.completed) return r;
            if (Date.now() - started > timeout) return { completed: true, error: "pollTask 超时" };
            await new Promise((res) => setTimeout(res, Math.min(interval, 200))); // 自检时加速
        }
    };
}

/* ------------------------------------------------------------------ */
/* 3. 最小 axios / FormData 替身（零依赖，只覆盖 vendor 用到的调用面）    */
/* ------------------------------------------------------------------ */
class MiniFormData {
    constructor() {
        this.parts = [];
        this.boundary = `----xoicheck${Math.random().toString(36).slice(2)}`;
    }
    append(key, value, opts = {}) {
        this.parts.push({ key, value, filename: opts.filename, contentType: opts.contentType });
    }
    getHeaders() {
        return { "Content-Type": `multipart/form-data; boundary=${this.boundary}` };
    }
    serialize() {
        const chunks = [];
        for (const p of this.parts) {
            chunks.push(Buffer.from(`--${this.boundary}\r\n`));
            if (Buffer.isBuffer(p.value)) {
                chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.key}"; filename="${p.filename}"\r\n`));
                chunks.push(Buffer.from(`Content-Type: ${p.contentType || "application/octet-stream"}\r\n\r\n`));
                chunks.push(p.value, Buffer.from("\r\n"));
            } else {
                chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.key}"\r\n\r\n`));
                chunks.push(Buffer.from(String(p.value)), Buffer.from("\r\n"));
            }
        }
        chunks.push(Buffer.from(`--${this.boundary}--\r\n`));
        return Buffer.concat(chunks);
    }
}

/** 记录每一次请求，供断言用 */
const calls = [];

function makeAxios() {
    const doRequest = async (method, url, body, cfg = {}) => {
        let payload;
        let contentType = "application/json";
        if (body instanceof MiniFormData) {
            payload = body.serialize();
            contentType = body.getHeaders()["Content-Type"];
        } else if (body !== undefined) {
            payload = JSON.stringify(body);
        }
        calls.push({ method, url, body, headers: { ...(cfg.headers || {}), "Content-Type": contentType } });

        const res = await fetch(url, {
            method,
            headers: { ...(cfg.headers || {}), "Content-Type": contentType },
            body: payload,
        });
        const buf = Buffer.from(await res.arrayBuffer());
        if (cfg.responseType === "arraybuffer") return { status: res.status, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
        const text = buf.toString("utf8");
        let data = text;
        try {
            data = JSON.parse(text);
        } catch {
            /* 非 JSON 就原样给 */
        }
        if (res.status >= 400) {
            const err = new Error(`HTTP ${res.status}`);
            err.response = { status: res.status, data };
            throw err;
        }
        return { status: res.status, data };
    };
    return {
        post: (url, body, cfg) => doRequest("POST", url, body, cfg),
        get: (url, cfg) => doRequest("GET", url, undefined, cfg),
    };
}

/* ------------------------------------------------------------------ */
/* 4. 假 new-api                                                       */
/* ------------------------------------------------------------------ */
async function startFakeGateway() {
    const seen = [];
    const server = http.createServer((req, res) => {
        let raw = [];
        req.on("data", (c) => raw.push(c));
        req.on("end", () => {
            const body = Buffer.concat(raw);
            const entry = { method: req.method, url: req.url, contentType: req.headers["content-type"] || "", body };
            seen.push(entry);
            const json = (obj, status = 200) => {
                const t = JSON.stringify(obj);
                res.writeHead(status, { "Content-Type": "application/json" });
                res.end(t);
            };

            if (req.url === "/v1/models") {
                return json({
                    object: "list",
                    data: [
                        { id: "gpt-5.4" },
                        { id: "seedream-4-0" },
                        { id: "kling-v2-5" },
                        { id: "tts-1" },
                    ],
                });
            }
            if (req.url === "/v1/chat/completions") return json({ id: "chatcmpl-1", choices: [{ message: { role: "assistant", content: "pong" } }] });
            if (req.url === "/v1/images/generations") return json({ created: 1, data: [{ url: "https://fake.local/img/1.png" }] });
            if (req.url === "/v1/images/edits") return json({ created: 1, data: [{ url: "https://fake.local/img/edit-1.png" }] });
            // 造物契约：视频是 /v1/videos 三件套（提交 → 轮询 → 取二进制成片）。
            // content 必须排在通用 /v1/videos/{id} 前面，否则会被抢走。
            if (req.url === "/v1/videos" && req.method === "POST") {
                // 造物风格的错误信封：只有 code + message，**没有 data 键**。
                // 适配器的 unwrap() 必须能凭它抛错（回归：以前要求 data !== undefined，会漏判）。
                const p = body.toString("utf8");
                if (p.includes("ERR_ENVELOPE")) return json({ code: "task_not_exist", message: "任务不存在" });
                return json({ id: "task-abc", status: "queued" });
            }
            if (/^\/v1\/videos\/[^/]+\/content$/.test(req.url || "")) {
                const mp4 = Buffer.from("FAKE-MP4-BYTES");
                res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": String(mp4.length) });
                return res.end(mp4);
            }
            if (/^\/v1\/videos\/[^/]+$/.test(req.url || "")) return json({ id: "task-abc", status: "completed" });
            if (req.url === "/v1/audio/speech") {
                const t = Buffer.from("ID3fake-mp3-bytes");
                res.writeHead(200, { "Content-Type": "audio/mpeg" });
                return res.end(t);
            }
            return json({ success: false, message: "not found" }, 404);
        });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    return { server, seen, port: server.address().port };
}

/* ------------------------------------------------------------------ */
/* 5. 主流程                                                           */
/* ------------------------------------------------------------------ */
async function main() {
    console.log(`\n══════ vendor 自检：${target} ══════`);
    if (!fs.existsSync(file)) {
        console.error(`✗ 找不到 ${path.relative(ROOT, file)}`);
        process.exit(1);
    }

    // —— 加载 ——
    let exportsObj;
    try {
        const esbuild = await loadEsbuild();
        let src = fs.readFileSync(file, "utf8");
        // 先补一句 `export {}` 再转译：
        //   有的 vendor 只写 `exports.vendor = ...`（纯 CJS 风格，如 vidu.ts），
        //   esbuild 会把这种文件整个包成 `export default require_stdin()`，与后端 sucrase
        //   的行为不一致，导致误报。补一个空导出让它按 ESM 处理，转译后再把 `export {};` 去掉 ——
        //   这一步正好与 backend/src/utils/vm.ts 的处理方式对齐。
        if (!/export\s*\{\s*\};?\s*$/.test(src)) src += "\nexport {};\n";
        const js = esbuild.transformSync(src, { loader: "ts", format: "esm", target: "esnext" }).code.replace(/export\s*\{\s*\};?/g, "");
        const { sandbox, exportsObj: ex } = buildSandbox();
        sandbox.axios = makeAxios();
        sandbox.FormData = MiniFormData;
        sandbox.pollTask = makePollTask();
        vm.runInNewContext(js, vm.createContext(sandbox, { name: "vendor-code", codeGeneration: { strings: false, wasm: false } }));
        exportsObj = ex;
        pass("编译 + 沙箱加载");
    } catch (e) {
        fail("编译 + 沙箱加载", e.message);
        return report();
    }

    // —— 结构 ——
    const v = exportsObj.vendor;
    if (!v || typeof v !== "object") {
        fail("导出 vendor 配置");
        return report();
    }
    pass("导出 vendor 配置", `id=${v.id} name=${v.name} version=${v.version}`);
    if (!v.id) fail("vendor.id 必填");
    else pass("vendor.id 必填", v.id);
    if (!v.version) warn("vendor.version 缺失", "多数平台模板会写 2.0；纯视频供应商可能没有");
    else pass("vendor.version", v.version);
    if (!Array.isArray(v.inputs) || !v.inputs.length) fail("inputs 非空");
    else pass("inputs 非空", v.inputs.map((i) => i.key).join(", "));
    if (!Array.isArray(v.models)) fail("models 是数组");
    else pass("models 是数组", `${v.models.length} 个`);

    const wantFns = ["textRequest", "imageRequest", "videoRequest", "ttsRequest"];
    let fnCount = 0;
    for (const fn of wantFns) {
        if (typeof exportsObj[fn] === "function") {
            fnCount++;
            pass(`导出 ${fn}`);
        } else if (strict) {
            fail(`导出 ${fn}`, "严格模式下必须有");
        } else {
            warn(`未导出 ${fn}`, "该供应商可能不提供这项能力");
        }
    }
    if (fnCount === 0) fail("至少导出一个 request 函数");
    if (typeof exportsObj.fetchModels === "function") pass("导出 fetchModels（可拉模型列表）");

    if (!useMock) return report();

    // —— 假网关实跑 ——
    const gw = await startFakeGateway();
    const base = `http://127.0.0.1:${gw.port}/v1`;
    console.log(`\n   假网关已启动：${base}（零花费）\n`);

    // 把 baseUrl / apiKey 填进去
    v.inputValues.baseUrl = base;
    v.inputValues.apiKey = "sk-fake-for-check";

    const pick = (type) => v.models.find((m) => m.type === type) || { name: "x", modelName: `${type}-model`, type };

    // 文本
    try {
        const model = exportsObj.textRequest(pick("text"), false, 0);
        if (model && model.__fake) pass("textRequest 返回可用模型", `model=${model.__fake}`);
        else fail("textRequest 返回可用模型");
    } catch (e) {
        fail("textRequest", e.message);
    }

    // 图片（文生图）
    try {
        const img = await exportsObj.imageRequest({ prompt: "一只猫", size: "2K", aspectRatio: "16:9" }, pick("image"));
        const last = calls.filter((c) => c.url.endsWith("/images/generations")).pop();
        // 造物契约（src/lib/image-size.ts 的 IMAGE_SIZES 白名单）：
        //   2K + 16:9 → 2048x1152（**不是** 3840x2160，那是 4K 那一格）
        //   清晰度发 resolution:"2K"，**绝对不能发 quality:"high"**
        if (last?.body?.size !== "2048x1152") fail("文生图 size 映射", `实际 ${last?.body?.size}，期望 2048x1152`);
        else pass("文生图 size 映射", last.body.size);
        if (last?.body?.resolution !== "2K") fail("2K 走 resolution", `实际 ${last?.body?.resolution}`);
        else pass("2K 走 resolution", last.body.resolution);
        if (last?.body?.quality !== undefined) fail("2K 不发 quality", `实际 ${JSON.stringify(last.body.quality)}（造物明确记录过 quality 是错的）`);
        else pass("2K 不发 quality");
        if (!/^https?:/.test(img)) fail("文生图返回 url");
        else pass("文生图返回 url", img);
    } catch (e) {
        fail("imageRequest(文生图)", e.message);
    }

    // 图片（4K + 1:1：造物白名单里最反直觉的一格，4096x4096 是错的）
    try {
        await exportsObj.imageRequest({ prompt: "一只猫", size: "4K", aspectRatio: "1:1" }, pick("image"));
        const last = calls.filter((c) => c.url.endsWith("/images/generations")).pop();
        if (last?.body?.size !== "2880x2880") fail("4K+1:1 size", `实际 ${last?.body?.size}，期望 2880x2880`);
        else pass("4K+1:1 size 映射", last.body.size);
        if (last?.body?.resolution !== "4K") fail("4K 走 resolution", `实际 ${last?.body?.resolution}`);
        else pass("4K 走 resolution", last.body.resolution);
    } catch (e) {
        fail("imageRequest(4K)", e.message);
    }

    // 图片（认不出的比例 → 不发 size，交模型自适应）
    try {
        await exportsObj.imageRequest({ prompt: "一只猫", size: "1K", aspectRatio: "auto" }, pick("image"));
        const last = calls.filter((c) => c.url.endsWith("/images/generations")).pop();
        if (last?.body?.size !== undefined) fail("auto 比例不发 size", `实际 ${JSON.stringify(last?.body?.size)}`);
        else pass("auto 比例不发 size");
    } catch (e) {
        fail("imageRequest(auto)", e.message);
    }

    // 图片（参考图 → /images/generations 的 images[]；造物契约：不走 multipart /images/edits）
    try {
        const ref = "data:image/png;base64," + Buffer.from("fake-png").toString("base64");
        await exportsObj.imageRequest(
            { prompt: "换背景", size: "1K", aspectRatio: "1:1", referenceList: [{ type: "image", base64: ref }] },
            pick("image"),
        );
        const last = calls.filter((c) => c.url.endsWith("/images/generations")).pop();
        const imgs = last?.body?.images;
        if (!Array.isArray(imgs) || !imgs.length) fail("参考图放进 images[]", `实际 ${JSON.stringify(imgs)}`);
        else if (!String(imgs[0]).startsWith("data:image/")) fail("images[] 里是 base64 data URL", String(imgs[0]).slice(0, 32));
        else pass("参考图走 /images/generations 的 images[]", `${imgs.length} 张`);
    } catch (e) {
        fail("imageRequest(参考图)", e.message);
    }

    // 视频（提交 + 轮询）
    try {
        const vid = await exportsObj.videoRequest(
            { prompt: "镜头推进", duration: 5, resolution: "1280x720", aspectRatio: "16:9", mode: "text" },
            { ...pick("video"), mode: ["text"] },
        );
        const submitted = calls.find((c) => c.method === "POST" && c.url.endsWith("/v1/videos"));
        const polled = calls.find((c) => /\/v1\/videos\/[^/]+$/.test(c.url));
        const content = calls.find((c) => /\/v1\/videos\/[^/]+\/content$/.test(c.url));
        const vbody = submitted?.body || {};
        if (!submitted) fail("视频任务提交到 /v1/videos");
        else if (!(vbody.model && "prompt" in vbody)) fail("视频提交体含 model/prompt", JSON.stringify(vbody).slice(0, 120));
        else pass("视频任务提交 /v1/videos", `${JSON.stringify(vbody).slice(0, 90)}…`);
        // 参数名必须是 seconds（不是 duration），清晰度用 resolution 原样发
        // 当前 NewAPI 视频契约要求 seconds 为字符串（例如 "5"）。
        if (typeof vbody.seconds !== "string" || !/^\d+$/.test(vbody.seconds)) fail("视频参数名用 seconds 字符串", `实际 ${vbody.seconds}`);
        else pass("视频参数名用 seconds", String(vbody.seconds));
        if (!vbody.resolution) fail("视频带 resolution", `实际 ${vbody.resolution}`);
        else pass("视频带 resolution", String(vbody.resolution));
        if (!polled) fail("视频轮询 GET /v1/videos/{id}");
        else pass("视频轮询 GET /v1/videos/{id}", polled.url);
        if (!content) fail("成片走 GET /v1/videos/{id}/content");
        else pass("成片走 GET /v1/videos/{id}/content", content.url);
        if (!String(vid).includes("mp4")) fail("视频返回可下载地址", String(vid).slice(0, 40));
        else pass("视频返回可下载地址", String(vid).slice(0, 40) + "…");
    } catch (e) {
        fail("videoRequest", e.message);
    }

    // 视频（错误信封回归：{code, message} 不带 data 键，unwrap 必须抛错）
    try {
        await exportsObj.videoRequest(
            { prompt: "ERR_ENVELOPE", duration: 5, resolution: "1280x720", aspectRatio: "16:9", mode: "text" },
            { ...pick("video"), mode: ["text"] },
        );
        fail("错误信封要抛错", "没有抛错，说明 unwrap 漏判了不带 data 的 {code,message}");
    } catch (e) {
        if (!/任务不存在/.test(String(e.message))) fail("错误信封要抛上游 message", `实际 "${e.message}"`);
        else pass("错误信封抛上游 message", e.message);
    }

    // 语音
    try {
        const audio = await exportsObj.ttsRequest({ text: "你好", voice: "alloy", speechRate: 1, pitchRate: 1, volume: 1 }, { name: "tts", modelName: "tts-1", type: "tts", voices: [] });
        if (!String(audio).startsWith("data:audio/")) fail("ttsRequest 返回音频 data URL", String(audio).slice(0, 40));
        else pass("ttsRequest 返回音频 data URL", `${String(audio).length} 字符`);
    } catch (e) {
        fail("ttsRequest", e.message);
    }

    // 模型列表
    if (typeof exportsObj.fetchModels === "function") {
        try {
            const list = await exportsObj.fetchModels();
            pass("fetchModels 可用", `text ${list.text.length} / image ${list.image.length} / video ${list.video.length}`);
        } catch (e) {
            fail("fetchModels", e.message);
        }
    }

    gw.server.close();
    return report();
}

function report() {
    console.log("\n──────── 结果 ────────");
    for (const r of results) {
        const icon = r.level === "pass" ? "✓" : r.level === "warn" ? "!" : "✗";
        console.log(`${icon} ${r.name}${r.extra ? `  （${r.extra}）` : ""}`);
    }
    const failed = results.filter((r) => r.level === "fail").length;
    const warned = results.filter((r) => r.level === "warn").length;
    const passed = results.filter((r) => r.level === "pass").length;
    console.log(
        `\n通过 ${passed}，提示 ${warned}，失败 ${failed}${failed ? " ← 需要修复" : " ← 可用"}\n` +
            (warned ? "（提示项表示该供应商本来就不提供这项能力，或缺少可选字段，不代表有问题）\n" : ""),
    );
    process.exit(failed ? 1 : 0);
}

main().catch((e) => {
    console.error("自检脚本自身出错：", e);
    process.exit(1);
});
