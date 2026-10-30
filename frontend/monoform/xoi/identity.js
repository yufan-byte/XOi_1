import { sceneKey } from "./scene-key.js";

/**
 * 启动前的身份与工程归属核验。
 *
 * 为什么必须放在 React 之前：本地存储不能替代服务器 ACL。直接打开一个
 * 旧工程地址（或把 ?key= 改成别人的）时，必须先向后端确认账号，再决定是否渲染工作台。
 *
 * 上游原来的做法是一个独立脚本 `xoi-identity-bootstrap.js`，但它最后一行
 * `await import("./assets/index-tvYA_XCr.js")` 硬编码了**构建产物的文件名**——
 * 每次构建 hash 都会变，这套机制一升级就断。所以改成入口里 await 校验再 render。
 */

/** 工程号归属：场景与画布共用一套前缀规则 */
function ownsScene(key, userId) {
  return (
    key.startsWith(`director3d-u${userId}-`) || key.startsWith(`u${userId}-canvas-`)
  );
}

export async function verifyIdentity() {
  const token = localStorage.getItem("xoi_session");
  if (!token) throw new Error("请先登录");

  const response = await fetch("/api/auth/me", {
    credentials: "same-origin",
    headers: { "X-Xoi-Expected-User": token.split(":")[0] },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("登录身份验证失败");

  const data = await response.json();
  const userId = Number(data?.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("登录身份无效");
  }
  // 校验期间账号可能被切换（另一个标签页退出登录）
  if (localStorage.getItem("xoi_session") !== token || String(userId) !== token.split(":")[0]) {
    throw new Error("账号已切换，请重新打开工程");
  }

  const key = sceneKey();
  // Web 工作台必须从当前账号的场景入口打开，不使用共享草稿槽位。
  if (!key || !ownsScene(key, userId)) {
    throw new Error("这个工程不属于当前账号，或是尚未归属的旧工程");
  }

  // 账号一旦变化立即重载，避免上一个账号的场景继续留在屏幕上
  const checkAccount = () => {
    if (localStorage.getItem("xoi_session") !== token) {
      document.getElementById("root")?.replaceChildren();
      location.reload();
    }
  };
  window.addEventListener("storage", checkAccount);
  window.addEventListener("focus", checkAccount);
  window.addEventListener("pageshow", checkAccount);
  setInterval(() => {
    if (!document.hidden) checkAccount();
  }, 5000);

  return { userId, key, token };
}

/** 核验失败时的兜底页：样式与工作台同一套暗色，不闪白 */
export function renderRefusal(root, message) {
  if (!root) return;
  root.textContent = "";
  const notice = document.createElement("div");
  notice.style.cssText =
    "min-height:100vh;display:grid;place-content:center;gap:12px;text-align:center;" +
    "background:#1f1f1d;color:#eee9df;font:16px 'PingFang SC',system-ui,sans-serif";
  const title = document.createElement("strong");
  title.textContent = "无法打开导演台工程";
  const detail = document.createElement("span");
  detail.textContent = message;
  notice.append(title, detail);
  root.append(notice);
}
