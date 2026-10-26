/**
 * 平台管理 · 版本与更新（仅站长 role ≥ 100）
 *
 * 能力：查看当前版本 / 从 GitHub 检查最新版本 / （git-script 模式）触发服务端更新脚本。
 *
 * ⚠️ 安全面（这是全平台最高危的操作，每一层都不许省）：
 *   1. 双重鉴权：/api/admin 已有 requireAdmin（role≥10），本路由内部再校验 role≥100；
 *   2. 更新脚本路径是服务端常量（ops/update.sh），**绝不接受用户传入的命令或路径**；
 *   3. 目标版本号走两道白名单（本路由 + 脚本内），仅 [A-Za-z0-9._-]，杜绝命令注入；
 *   4. GitHub 出站走 safeUrl（fetchTextWithLimit：公网校验 + DNS rebinding 防护 + 大小截断）；
 *   5. 执行为 detach 子进程 + 日志落盘，HTTP 请求立即返回 —— 不存在长连接挂死后半更新的状态；
 *   6. 运行模式开关：XOI_UPDATE_MODE 未配置或 manual 时只读（检查更新可用、执行被拒），
 *      docker 部署用镜像更新，不走本功能 —— 由部署文档说明。
 */
import express from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { success, error } from "@/lib/responseFormat";
import { currentUser } from "@/lib/reseller/auth";
import { fetchTextWithLimit } from "@/utils/safeUrl";
import { serviceIdentity } from "@/utils/serviceConfig";

const router = express.Router();

const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const LOG_PATH = path.join(process.env.XOI_DATA_DIR || path.resolve("data"), "update-log.txt");
const SCRIPT_PATH = path.resolve("ops/update.sh");
const UPDATE_MODE = String(process.env.XOI_UPDATE_MODE || "manual");

/** 仅站长（role ≥ 100）：更新 = 全平台重启，普通管理员也不允许。 */
async function requireRoot(req: express.Request): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const me = await currentUser(req);
  if (!me) return { ok: false, status: 401, message: "请先登录" };
  if ((me.role ?? 0) < 100) return { ok: false, status: 403, message: "仅站长可以执行版本更新" };
  return { ok: true };
}

function localVersion() {
  let release = "development";
  try { release = serviceIdentity().release; } catch { /* 未配置发布标签时按 development 展示 */ }
  return { release, mode: UPDATE_MODE, modeLabel: UPDATE_MODE === "git-script" ? "脚本更新" : "服务器手动更新" };
}

router.get("/current", async (_req, res) => {
  const root = await requireRoot(_req);
  if (!root.ok) return res.status(root.status).json(error(root.message));
  const info = localVersion();
  // git 信息尽力而为：镜像部署没有 .git，显示为空即可
  const git = await new Promise<{ commit?: string; branch?: string }>((resolve) => {
    execFile("git", ["rev-parse", "--short", "HEAD"], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve({});
      execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], { timeout: 3000 }, (err2, branch) =>
        resolve({ commit: String(stdout).trim(), branch: err2 ? undefined : String(branch).trim() }));
    });
  });
  res.json(success({ ...info, ...git, scriptReady: fs.existsSync(SCRIPT_PATH) }));
});

let latestCache: { at: number; payload: unknown } | null = null;
router.get("/latest", async (req, res) => {
  const root = await requireRoot(req);
  if (!root.ok) return res.status(root.status).json(error(root.message));
  const repo = String(process.env.XOI_UPDATE_REPO || "").replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    return res.json(success({ configured: false, message: "未配置 XOI_UPDATE_REPO（owner/repo），无法检查远程版本" }));
  }
  if (latestCache && Date.now() - latestCache.at < 300_000) return res.json(success(latestCache.payload));
  try {
    const raw = await fetchTextWithLimit(`https://api.github.com/repos/${repo}/releases/latest`, 512 * 1024);
    const data = JSON.parse(raw) as { tag_name?: string; name?: string; body?: string; published_at?: string; html_url?: string };
    const payload = {
      configured: true,
      repo,
      tag: String(data.tag_name || ""),
      name: String(data.name || data.tag_name || ""),
      notes: String(data.body || "").slice(0, 4000),
      publishedAt: data.published_at || "",
      url: data.html_url || `https://github.com/${repo}/releases`,
    };
    latestCache = { at: Date.now(), payload };
    res.json(success(payload));
  } catch (e) {
    res.status(502).json(error(`检查更新失败：${(e as Error).message}`));
  }
});

router.post("/run", async (req, res) => {
  const root = await requireRoot(req);
  if (!root.ok) return res.status(root.status).json(error(root.message));
  if (UPDATE_MODE !== "git-script") {
    return res.status(400).json(error("当前部署未开启脚本更新（XOI_UPDATE_MODE=git-script 才允许）。docker 部署请按部署文档更新镜像。"));
  }
  if (!fs.existsSync(SCRIPT_PATH)) return res.status(400).json(error("服务器上没有找到 ops/update.sh，请先按部署文档放置更新脚本"));

  const target = String(req.body?.target || "").trim();
  if (!TAG_RE.test(target)) return res.status(400).json(error("目标版本号格式无效"));
  const reason = String(req.body?.reason || "").trim().slice(0, 200);
  if (reason.length < 4) return res.status(400).json(error("请填写更新原因（至少 4 字，会记入更新日志）"));

  // 日志开头先落审计（谁、何时、为何、更新到哪），脚本输出随后追加
  const me = await currentUser(req);
  const head = `[${new Date().toISOString()}] 更新发起 operator=${me?.username || me?.id} target=${target} reason=${reason}\n`;
  await fsp.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fsp.appendFile(LOG_PATH, head);

  // detach 执行：HTTP 立即返回；脚本自行完成 checkout/build/restart（守护进程拉起新版本）
  const child = execFile("bash", [SCRIPT_PATH, target], { timeout: 0 }, () => {});
  child.unref();
  child.stdout?.on("data", (d) => { void fsp.appendFile(LOG_PATH, String(d)).catch(() => {}); });
  child.stderr?.on("data", (d) => { void fsp.appendFile(LOG_PATH, String(d)).catch(() => {}); });

  res.json(success({ started: true, target, logPath: "data/update-log.txt" }));
});

router.get("/log", async (req, res) => {
  const root = await requireRoot(req);
  if (!root.ok) return res.status(root.status).json(error(root.message));
  try {
    const stat = await fsp.stat(LOG_PATH).catch(() => null);
    if (!stat) return res.json(success({ log: "", updatedAt: null }));
    const handle = await fsp.open(LOG_PATH, "r");
    const start = Math.max(0, stat.size - 16 * 1024);
    const buffer = await handle.read({ buffer: Buffer.alloc(stat.size - start), position: start, length: stat.size - start });
    await handle.close();
    res.json(success({ log: buffer.buffer.toString("utf8"), updatedAt: stat.mtime.toISOString() }));
  } catch (e) {
    res.status(502).json(error(`读取更新日志失败：${(e as Error).message}`));
  }
});

export default router;
