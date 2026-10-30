import { sessionSignal } from "./session";

export type DailySpend = {
  day: string;
  timezone: string;
  dailyWarningYuan: number;
  todayYuan: number;
  todayPoints: number;
  shouldRemind: boolean;
  blocking: false;
  claimed?: boolean;
};
let checking = false,
  lastRead = 0,
  lastOwner = "";
/** Observational only. No model requests, cancellation or authorization decisions live here. */
export async function checkDailySpendReminder() {
  const token = sessionSignal() || "";
  if (!token) return;
  if (lastOwner !== token) {
    lastOwner = token;
    lastRead = 0;
  }
  if (checking || Date.now() - lastRead < 15000) return;
  checking = true;
  lastRead = Date.now();
  try {
    // F3：凭据走 httpOnly cookie（同源自动携带）；token 只用于「本轮账号是否还是同一个」的比对。
    const requestInit = { credentials: "same-origin" as const };
    const response = await fetch("/api/billing/preferences", { ...requestInit, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const status = (await response.json()).data as DailySpend;
    if (!status?.shouldRemind || sessionSignal() !== token) return;
    const claim = await fetch("/api/billing/daily-notice/claim", { ...requestInit, method: "POST", signal: AbortSignal.timeout(5000) });
    if (!claim.ok) return;
    const data = (await claim.json()).data as DailySpend;
    if (!data?.claimed || sessionSignal() !== token) return;
    document.getElementById("xoi-daily-spend-reminder")?.remove();
    const box = document.createElement("aside");
    box.id = "xoi-daily-spend-reminder";
    box.setAttribute("role", "status");
    box.style.cssText =
      "position:fixed;right:20px;bottom:20px;z-index:2147482999;width:min(340px,calc(100vw - 40px));padding:16px 18px;border:1px solid #ebdfd5;border-radius:16px;background:#fffcf9;color:#55483f;box-shadow:0 12px 40px #34261b20;font:13px/1.7 system-ui,sans-serif";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "关闭今日消费提醒");
    close.style.cssText = "float:right;border:0;background:none;color:#8d8278;cursor:pointer;font-size:20px";
    close.onclick = () => box.remove();
    const title = document.createElement("strong");
    title.textContent = "今日消费提醒";
    const text = document.createElement("p");
    text.style.margin = "6px 0";
    text.textContent = `今日已累计消费 ¥${data.todayYuan.toFixed(2)}，达到你设置的 ¥${data.dailyWarningYuan.toFixed(2)}。仅作提醒，任务继续运行。`;
    const link = document.createElement("a");
    link.href = "/console/usage";
    link.target = "_top";
    link.textContent = "查看明细 / 修改提醒";
    link.style.color = "#bc5928";
    box.append(close, title, text, link);
    document.body.append(box);
    setTimeout(() => box.remove(), 15000);
  } catch {
    /* Reminder failures never interfere with generation. */
  } finally {
    checking = false;
  }
}
