#!/usr/bin/env node
/**
 * =====================================================================
 * console 子应用「静态资源路径」门禁
 * =====================================================================
 * 为什么需要它：
 *   frontend/console 是挂在 `/console/` 下的 React 子应用（vite base = /console/）。
 *   从造物源码原样拷过来的组件里，很多资源写的是**站点根绝对路径**
 *   （造物自己部署在根路径，写 `/icons/...` 没问题）。
 *   一旦照抄进 console，dev 和 prod **两端都会 404**：
 *     · dev：Vite 的 baseMiddleware 会先把 `/console/` 剥掉再匹配 public 目录，
 *            所以裸 `/icons/...` 落到 else 分支 → 404 并回复「did you mean /console/...」
 *     · prod：Express 只挂 `/console/*`，站点根的 `/icons/...` 没有任何人服务
 *   正确写法是用 `import.meta.env.BASE_URL` 拼（不要写字面量 `/console/`：
 *   dev 与 prod 的行为差异要靠 BASE_URL 统一）。
 *
 * 这个 bug 真实发生过：登录页「模型地球」的 20 个模型图标全部 404，
 * 而且连续两个会话都没被发现 —— 因为只核对了「图标文件存在」，没核对 URL 前缀。
 *
 * 用法：
 *   node ops/check-console-assets.mjs            # 查源码 + 查产物（产物不存在则跳过）
 *   node ops/check-console-assets.mjs --no-dist  # 只查源码（不要求先构建）
 * =====================================================================
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(ROOT, "frontend/console");
const SRC = path.join(APP, "src");
const PUB = path.join(APP, "public");
const DIST = path.join(ROOT, "frontend/public/console");
const BASE = "/console/";

/**
 * public 下的顶层素材目录（产物扫描用：只在这些目录里找 `/console/<dir>/...`）。
 * 注意：源码扫描**不能**只靠这份清单 —— 2026-10-02 就漏过 `public/agents/*.png`
 * （从造物拷 lib/agents.ts 时带进来的裸根路径），因为清单里没有 agents。
 * 所以源码扫描改成了「按扩展名判定」：只要是裸根路径 + 素材扩展名，一律算。
 */
const PUBLIC_DIRS = ["icons", "fonts", "agents", "showreel"];

/**
 * 静态素材扩展名：用来判断一个裸根路径是「素材」还是「页面路由」。
 * 故意不含 json / css：`/api/xxx.json` 这类**接口**路径本来就是站点根，不是 public 素材，不能误报。
 */
const ASSET_EXT = "svg|png|jpe?g|webp|gif|avif|ico|mp4|webm|mov|woff2?|ttf|otf";
/** 这些顶层路径是接口/协议前缀，裸根是正常的，不参与素材判定 */
const NOT_ASSET_PREFIX = ["api/", "console/"];

const reports = [];
const pass = (n, d) => reports.push({ lvl: "pass", n, d });
const fail = (n, d) => reports.push({ lvl: "fail", n, d });
const warn = (n, d) => reports.push({ lvl: "warn", n, d });

/* ------------------------------------------------------------------ */
/* 1. 源码里有没有「裸根绝对路径」的 public 资源引用                    */
/* ------------------------------------------------------------------ */
function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === "node_modules" || e.name === "dist") continue;
            walk(p, out);
        } else if (/\.(tsx?|jsx?|css|html)$/.test(e.name)) {
            out.push(p);
        }
    }
    return out;
}

/**
 * 把注释替换成空白（保留换行，行号不变）。
 * 必须做这一步：注释里举反例（「别写成 `/icons/...`」）会被正则误报。
 * 用一个小的状态机，避免把字符串里的 `//`（比如 https://）当注释。
 */
function stripComments(text) {
    let out = "";
    let i = 0;
    const n = text.length;
    let state = null; // null | '"' | "'" | "`" | "line" | "block"
    while (i < n) {
        const c = text[i];
        const d = text[i + 1];
        if (state === "line") {
            if (c === "\n") { state = null; out += c; } else out += " ";
            i++;
            continue;
        }
        if (state === "block") {
            if (c === "*" && d === "/") { state = null; out += "  "; i += 2; continue; }
            out += c === "\n" ? "\n" : " ";
            i++;
            continue;
        }
        if (state) {
            out += c;
            if (c === "\\") { out += d ?? ""; i += 2; continue; }
            if (c === state) state = null;
            i++;
            continue;
        }
        if (c === "/" && d === "/") { state = "line"; i += 2; continue; }
        if (c === "/" && d === "*") { state = "block"; i += 2; continue; }
        if (c === '"' || c === "'" || c === "`") { state = c; out += c; i++; continue; }
        out += c;
        i++;
    }
    return out;
}

function scanSource() {
    const files = walk(SRC);
    // 两条规则，命中任意一条即算「裸根」：
    //   A. 紧跟引号的 /icons/ 或 /fonts/（纯素材目录，不必看扩展名）
    //   B. 任何裸根路径 + 素材扩展名（这样 /agents/*.png、/showreel/*.mp4 也能抓到，
    //      不会因为没登记进 PUBLIC_DIRS 就漏网）
    // 两条都要求「紧跟引号」：`${BASE}icons/...` 这种带 base 的写法引号后是 $，天然不命中。
    const ruleA = new RegExp(`["'\`]/(?:icons|fonts)/`);
    const ruleB = new RegExp(`["'\`](/[\\w.-]+/[\\w./-]*\\.(?:${ASSET_EXT}))`);
    const hits = [];
    for (const f of files) {
        const text = stripComments(fs.readFileSync(f, "utf8"));
        text.split("\n").forEach((line, i) => {
            const m = line.match(ruleB);
            const hitB = !!m && !NOT_ASSET_PREFIX.some((p) => m[1].slice(1).startsWith(p));
            if (!ruleA.test(line) && !hitB) return;
            hits.push({ file: path.relative(ROOT, f), line: i + 1, text: line.trim().slice(0, 120) });
        });
    }
    if (hits.length) {
        fail("源码里没有裸根绝对路径的资源引用", `${hits.length} 处`);
        for (const h of hits) console.log(`     · ${h.file}:${h.line}  ${h.text}`);
        console.log(`     → 改成 \`\${import.meta.env.BASE_URL}<目录>/...\`（dev 与 prod 才能都对）`);
    } else {
        pass("源码里没有裸根绝对路径的资源引用", `扫了 ${files.length} 个文件`);
    }
}

/* ------------------------------------------------------------------ */
/* 2. 产物里引用到的 /console/ 资源，文件是否真的在 dist 里             */
/* ------------------------------------------------------------------ */
function scanDist() {
    if (!fs.existsSync(DIST)) {
        warn("产物检查", "还没有构建产物（先 `npm run build:console`），本次跳过");
        return;
    }
    const assetsDir = path.join(DIST, "assets");
    if (!fs.existsSync(assetsDir)) {
        warn("产物检查", "产物里没有 assets/，本次跳过");
        return;
    }

    // 从 JS/CSS 里抽出所有 /console/<dir>/<file> 形式的引用
    const refRe = new RegExp(`/console/(?:${PUBLIC_DIRS.join("|")})/[\\w./-]+`, "g");
    const refs = new Set();
    for (const n of fs.readdirSync(assetsDir)) {
        if (!/\.(js|css)$/.test(n)) continue;
        const text = fs.readFileSync(path.join(assetsDir, n), "utf8");
        for (const m of text.match(refRe) || []) refs.add(m);
    }
    // index.html 也扫
    const idx = path.join(DIST, "index.html");
    if (fs.existsSync(idx)) {
        const text = fs.readFileSync(idx, "utf8");
        for (const m of text.match(refRe) || []) refs.add(m);
    }

    if (!refs.size) {
        warn("产物里的静态资源引用", "一条都没扫到（可能是构建方式变了），请人工确认");
        return;
    }

    const missing = [];
    const dynamic = [];
    for (const r of refs) {
        const rel = r.slice(BASE.length); // /console/x → x
        if (fs.existsSync(path.join(DIST, rel))) continue;
        // 不以素材扩展名结尾的，多半是模板串拼出来的动态文件名
        // （例：showreel.tsx 的 `reel-${i + 1}.mp4` 编译后只剩前缀 `/console/showreel/reel-`）。
        // 这类没法逐个核对，退而验证「所在目录存在且非空」；目录都是空的才判失败。
        if (!/\.[a-z0-9]{2,5}$/i.test(rel)) {
            const dir = path.join(DIST, path.dirname(rel));
            if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
                dynamic.push(r);
                continue;
            }
        }
        missing.push(r);
    }
    if (missing.length) {
        fail("产物引用的静态资源都存在", `${missing.length} 个缺失`);
        for (const m of missing) console.log(`     ✗ ${m}`);
    } else {
        pass("产物引用的静态资源都存在", `${refs.size} 个${dynamic.length ? `（${dynamic.length} 个动态文件名只核了目录：${dynamic.join(", ")}）` : ""}`);
    }
}

/* ------------------------------------------------------------------ */
/* 3. 地球用到的图标是否真的在 public 里（防止换素材时漏拷）            */
/* ------------------------------------------------------------------ */
function scanOrbitIcons() {
    const f = path.join(SRC, "components/login/orbit-data.ts");
    if (!fs.existsSync(f)) return warn("模型地球图标清单", "找不到 orbit-data.ts，跳过");
    const text = fs.readFileSync(f, "utf8");
    // 形如 `${S}gemini.svg` / `${E}doubao.svg`
    const names = [...text.matchAll(/\$\{[SE]\}([\w.-]+\.svg)/g)].map((m) => m[1]);
    const uniq = [...new Set(names)];
    const roots = ["icons/providers/sculpted", "icons/providers/external"];
    const missing = [];
    for (const n of uniq) {
        // 图标可能落在 sculpted 或 external，只要有一个存在即可
        if (!roots.some((r) => fs.existsSync(path.join(PUB, r, n)))) missing.push(n);
    }
    if (missing.length) {
        fail("模型地球图标素材齐全", `缺 ${missing.length} 个：${missing.join(", ")}`);
    } else {
        pass("模型地球图标素材齐全", `${uniq.length} 个`);
    }
}

/** 只在「源码扫描」这一步要求先构建 */
const NO_DIST = process.argv.includes("--no-dist");

console.log("");
console.log("══════ console 静态资源路径门禁 ══════");
console.log("");
scanSource();
scanOrbitIcons();
if (!NO_DIST) scanDist();
console.log("");
console.log("──────── 结果 ────────");
for (const r of reports) {
    const mark = r.lvl === "pass" ? "✓" : r.lvl === "warn" ? "!" : "✗";
    console.log(`${mark} ${r.n}${r.d ? `  （${r.d}）` : ""}`);
}
const failed = reports.filter((r) => r.lvl === "fail").length;
const warned = reports.filter((r) => r.lvl === "warn").length;
console.log("");
console.log(
    `通过 ${reports.length - failed - warned}，提示 ${warned}，失败 ${failed}` +
        (failed ? " ← 有资源会 404" : warned ? " ← 可用（有跳过项）" : " ← 可用"),
);
console.log("");
process.exit(failed ? 1 : 0);
