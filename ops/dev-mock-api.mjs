#!/usr/bin/env node
/**
 * 本地假后端（开发演示用，零依赖）
 * =====================================================================
 * 作用：在没有 new-api、没有装 backend 依赖的情况下，让 frontend/console 的
 *       登录页能**真实点通** —— 登录、注册、验证码闸门、退出全流程。
 *
 * 它实现的是 **XOI 后端的对外契约**（不是 new-api）：
 *     POST /api/login/login      → { code:200, data:{token,name,id,display_id,role}, message }
 *     POST /api/login/register   → 同上 + email_bound / fallback_name
 *     GET  /api/login/captcha    → { code:200, data:{id,svg} }
 *     POST /api/login/logout     → { code:200 }
 *
 * 拉起方式：
 *     node ops/dev-mock-api.mjs            # 默认 12121（XOI 后端的位置）
 *     PORT=12121 node ops/dev-mock-api.mjs
 *
 * 演示要点：
 *   · 密码用 `demo` 前缀：`demo` / `demo1234` 一定是正确账号，方便快速登录
 *   · 连续失败 3 次会返回 HTTP 461 + 图形验证码，用来演示 XOI 独有的防爆破闸门
 *   · ⚠️ 这只是一段本地演示代码，**绝不要用于生产**
 */
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 12121);

/* ---------------- 内存态 ---------------- */
/** username -> { id, password, displayId } */
const users = new Map();
const tokens = new Map(); // token -> uid
let nextUid = 1001;
/** `ip|name` -> { fails, holdUntil } */
const risk = new Map();
/** captchaId -> { text, exp } */
const captchas = new Map();
/** 兜底响应的日志计数（避免刷屏） */
let unmatchedLogs = 0;

const FAIL_THRESHOLD = 3;
const HOLD_MS = 5 * 60 * 1000;
const CAPTCHA_TTL = 2 * 60 * 1000;

// 预置一个演示账号
users.set("demo", { id: nextUid++, password: "demo1234", displayId: "923800" });
users.set("demo@xoi.net", { id: nextUid++, password: "demo1234", displayId: "651204" });

/* ---------------- 工具 ---------------- */
const ok = (data = null, message = "成功") => ({ code: 200, data, message });
const bad = (message = "请求失败", data = null) => ({ code: 400, data, message });

function send(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(text),
        "Cache-Control": "no-store",
        // 主站 dev 模式下 axios 直连 12121（见 frontend/src/stores/setting.ts 的 baseUrl），
        // 不走 vite 代理，所以这里必须自己带 CORS 头，否则浏览器会拦掉所有请求。
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Max-Age": "86400",
    });
    res.end(text);
}

function readBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
            } catch {
                resolve({});
            }
        });
        req.on("error", () => resolve({}));
    });
}

const clientIp = (req) => (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").toString().split(",")[0].trim();
const comboKey = (ip, name) => `${ip}|${String(name || "").toLowerCase()}`;

/** 造 6 位数字验证码的 SVG（与后端 svg-captcha 的观感接近，够演示用） */
function makeCaptcha() {
    let text = "";
    for (let i = 0; i < 6; i++) text += String(crypto.randomInt(1, 10));
    const glyphs = [...text]
        .map((ch, i) => {
            const x = 14 + i * 19;
            const y = 30 + crypto.randomInt(-4, 5);
            const rot = crypto.randomInt(-14, 15);
            return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="monospace" font-size="26" font-weight="700" fill="#4c3fa8">${ch}</text>`;
        })
        .join("");
    const lines = Array.from({ length: 3 }, () => {
        const y1 = crypto.randomInt(4, 44);
        const y2 = crypto.randomInt(4, 44);
        return `<path d="M0 ${y1} Q 66 ${crypto.randomInt(0, 44)} 132 ${y2}" stroke="#b9b2e6" stroke-width="1" fill="none"/>`;
    }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="132" height="44" viewBox="0 0 132 44"><rect width="132" height="44" fill="#f7f6fd"/>${lines}${glyphs}</svg>`;
    const id = `cap-${Date.now().toString(36)}-${crypto.randomInt(1e6).toString(36)}`;
    captchas.set(id, { text, exp: Date.now() + CAPTCHA_TTL });
    return { id, svg };
}

function takeCaptcha(id, input) {
    if (!id || !input) return false;
    const rec = captchas.get(id);
    captchas.delete(id); // 命中与否都作废，杜绝穷举
    return !!rec && rec.exp >= Date.now() && String(input).trim() === rec.text;
}

function issueToken(uid) {
    const t = `Bearer mock.${uid}.${crypto.randomBytes(12).toString("hex")}`;
    tokens.set(t, uid);
    return t;
}

function findByName(name) {
    const key = String(name || "").trim();
    if (users.has(key)) return users.get(key);
    const lower = key.toLowerCase();
    for (const [k, v] of users) if (k.toLowerCase() === lower) return v;
    return null;
}

function makeUser(username) {
    return { id: nextUid++, password: "", displayId: String(crypto.randomInt(100000, 1000000)), username };
}

/* ---------------- 路由 ---------------- */
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;
    const ip = clientIp(req);
    const key = comboKey(ip, undefined);

    // CORS 预检：OPTIONS 直接放行
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Max-Age": "86400",
        });
        return res.end();
    }

    // 每次请求都顺手清一遍过期验证码
    for (const [id, rec] of captchas) if (rec.exp < Date.now()) captchas.delete(id);

    // GET /api/login/captcha —— 公开取码
    if (path === "/api/login/captcha" && req.method === "GET") {
        const fresh = makeCaptcha();
        console.log(`[mock] 取码 ${fresh.id} → 答案 ${captchas.get(fresh.id).text}`);
        return send(res, 200, ok({ id: fresh.id, svg: fresh.svg }, "ok"));
    }

    // POST /api/login/logout
    if (path === "/api/login/logout" && req.method === "POST") {
        const t = String(req.headers.authorization || "");
        tokens.delete(t);
        return send(res, 200, ok(null, "已退出登录"));
    }

    // —— 兜底：其它接口一律回一个「空但成功」的应答 ——
    // 目的只有一个：让主站能正常渲染骨架，而不是满屏 404 白屏。
    // 返回值的形状按路径猜：列表类给 []，其余给 {}，避免前端 .map 时崩掉。
    if (!["/api/login/login", "/api/login/register"].includes(path)) {
        if (unmatchedLogs < 20) {
            unmatchedLogs++;
            console.log(`[mock] 兜底响应 ${req.method} ${path}`);
            if (unmatchedLogs === 20) console.log("[mock] （后续兜底请求不再逐条打印）");
        }
        const looksLikeList = /(list|page|all|records|history|items)/i.test(path);
        return send(res, 200, ok(looksLikeList ? [] : {}, "mock-stub"));
    }

    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const k = comboKey(ip, username);

    // ---- 风控闸门：持守期内必须带有效验证码 ----
    const rec = risk.get(k);
    if (rec && rec.holds >= FAIL_THRESHOLD && rec.until > Date.now()) {
        if (!takeCaptcha(body.captchaId, body.captchaInput)) {
            const fresh = makeCaptcha();
            console.log(`[mock] 触发验证码闸门（${username} 已失败 ${rec.holds} 次）`);
            return send(res, 461, {
                code: 461,
                message: "请完成图形验证",
                data: {
                    requireCaptcha: true,
                    reason: "FAIL_THRESHOLD",
                    captchaId: fresh.id,
                    captchaSvg: fresh.svg,
                    hint: "请识别图中数字并在下方输入后再提交。",
                },
            });
        }
    }

    // ---- 注册 ----
    if (path === "/api/login/register") {
        if (findByName(username)) return send(res, 400, bad("用户名已存在"));
        if (password.length < 6) return send(res, 400, bad("密码至少 6 位"));
        const u = makeUser(username);
        u.password = password;
        users.set(username, u);
        risk.delete(k);
        const token = issueToken(u.id);
        console.log(`[mock] 注册成功 ${username} → uid ${u.id}`);
        return send(
            res,
            200,
            ok(
                {
                    token,
                    name: username,
                    id: u.id,
                    display_id: u.displayId,
                    role: "user",
                    email_bound: username.includes("@"),
                    fallback_name: undefined,
                },
                "注册成功",
            ),
        );
    }

    // ---- 登录 ----
    const user = findByName(username);
    if (!user || user.password !== password) {
        const r = risk.get(k) || { holds: 0, until: 0 };
        r.holds += 1;
        r.until = Date.now() + HOLD_MS;
        risk.set(k, r);
        console.log(`[mock] 登录失败 ${username}（累计 ${r.holds}）`);
        return send(res, 400, bad("用户名或密码错误"));
    }

    risk.delete(k);
    const token = issueToken(user.id);
    console.log(`[mock] 登录成功 ${username} → uid ${user.id}`);
    return send(
        res,
        200,
        ok({ token, name: username, id: user.id, display_id: user.displayId, role: "user" }, "登录成功"),
    );
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`\n[mock-api] XOI 假后端已启动: http://127.0.0.1:${PORT}`);
    console.log(`[mock-api] 演示账号: demo / demo1234   或   demo@xoi.net / demo1234`);
    console.log(`[mock-api] 连续输错 ${FAIL_THRESHOLD} 次会弹出图形验证码闸门\n`);
});
