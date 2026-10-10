// MONOFORM 是静态构建产物；启动前仍须向 XOi 后端核验账号和工程 key。
// 这能阻止直接打开旧的公共工程，但浏览器本地存储不能替代服务器 ACL。
const root = document.getElementById("root");

function refuse(message) {
  root.textContent = "";
  const notice = document.createElement("div");
  notice.style.cssText = "min-height:100vh;display:grid;place-content:center;gap:12px;text-align:center;background:#1f1f1d;color:#eee9df;font:16px PingFang SC,sans-serif";
  const title = document.createElement("strong");
  title.textContent = "无法打开导演台工程";
  const detail = document.createElement("span");
  detail.textContent = message;
  notice.append(title, detail);
  root.append(notice);
}

try {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("请先登录");
  const response = await fetch("/api/auth/me", { headers: { Authorization: token }, cache: "no-store" });
  if (!response.ok) throw new Error("登录身份验证失败");
  const data = await response.json();
  const userId = Number(data?.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0 || localStorage.getItem("token") !== token) {
    throw new Error("账号已切换，请重新打开工程");
  }
  const key = new URLSearchParams(location.search).get("key") || "";
  const allowed = key.startsWith(`director3d-u${userId}-`) || key.startsWith(`u${userId}-canvas-`);
  if (!allowed) throw new Error("这个工程不属于当前账号，或是尚未归属的旧工程");
  const checkAccount = () => {
    if (localStorage.getItem("token") !== token) location.reload();
  };
  window.addEventListener("storage", checkAccount);
  window.addEventListener("focus", checkAccount);
  window.setInterval(checkAccount, 2000);
  await import("./assets/index-tvYA_XCr.js?v=empty-scene-2");
} catch (error) {
  refuse(error instanceof Error ? error.message : "请稍后重试");
}
