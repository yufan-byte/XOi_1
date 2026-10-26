// AI 剪辑的动效组件（参考站 2026-10-01「动效组件」）：画在每一帧上的动画叠层，不依赖素材本身。
// title：动态标题条（从左滑入，带强调色竖条）；sticker：社交贴纸（弹出 + 轻微摇摆，如「点赞关注」）；
// number：数字滚动（从 0 数到目标值，保留前后缀，如「3000+ 人打卡」「98%」）。
export type FxKind = "title" | "sticker" | "number";
export interface ClipFx { kind: FxKind; text: string }
export const FX_LABEL: Record<FxKind, string> = { title: "动态标题", sticker: "社交贴纸", number: "数字滚动" };

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;
/** 回弹：先冲过头再回落，贴纸弹出用 */
export const easeOutBack = (x: number) => { const c = 1.70158, t = clamp(x) - 1; return 1 + (c + 1) * t ** 3 + c * t ** 2; };

/** 拆出文本里第一个数：前缀 / 数值 / 小数位 / 后缀；没有数返回 null */
export function parseCount(text: string): { pre: string; value: number; decimals: number; post: string } | null {
  const m = /(-?\d[\d,]*(?:\.\d+)?)/.exec(text); if (!m) return null;
  const raw = m[1].replace(/,/g, ""); const value = Number(raw); if (!Number.isFinite(value)) return null;
  return { pre: text.slice(0, m.index), value, decimals: raw.includes(".") ? raw.split(".")[1].length : 0, post: text.slice(m.index + m[1].length) };
}
/** 数字滚动在 t 秒（本段内）显示的文字：前 1.2 秒从 0 数到目标值 */
export function countText(text: string, t: number, span = 1.2): string {
  const c = parseCount(text); if (!c) return text;
  const v = c.value * easeOut(t / span); const s = c.decimals ? v.toFixed(c.decimals) : Math.round(v).toLocaleString("en-US");
  return `${c.pre}${s}${c.post}`;
}

export function sanitizeFx(raw: unknown): ClipFx | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as { kind?: unknown; text?: unknown };
  const kind = o.kind === "title" || o.kind === "sticker" || o.kind === "number" ? o.kind : undefined;
  const text = typeof o.text === "string" ? o.text.trim().slice(0, 20) : "";
  if (!kind || !text || (kind === "number" && !parseCount(text))) return undefined;
  return { kind, text };
}

const FONT = `-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
/** 在第 t 秒（本段内，段长 dur）画动效；进出场各约 0.4 秒 */
export function drawFx(ctx: CanvasRenderingContext2D, fx: ClipFx, W: number, H: number, t: number, dur: number) {
  const out = clamp((dur - t) / 0.35); const base = Math.min(W, H);
  ctx.save();
  if (fx.kind === "title") {
    const p = easeOut(t / 0.45); const fs = Math.round(base * 0.062); ctx.font = `800 ${fs}px ${FONT}`; ctx.textBaseline = "middle";
    const tw = ctx.measureText(fx.text).width; const padX = fs * 0.6, h = fs * 1.7, x0 = W * 0.06, y = H * 0.16;
    const w = tw + padX * 2 + fs * 0.35;
    ctx.globalAlpha = out; ctx.translate((p - 1) * (w + x0), 0);
    ctx.fillStyle = "rgba(10,10,14,.72)"; ctx.beginPath(); ctx.roundRect(x0, y - h / 2, w, h, fs * 0.3); ctx.fill();
    ctx.fillStyle = "#ffd43b"; ctx.fillRect(x0, y - h / 2, fs * 0.22, h);
    ctx.fillStyle = "#fff"; ctx.fillText(fx.text, x0 + fs * 0.22 + padX, y);
  } else if (fx.kind === "sticker") {
    const s = easeOutBack(t / 0.4) * out; if (s <= 0) { ctx.restore(); return; }
    const fs = Math.round(base * 0.05); ctx.font = `800 ${fs}px ${FONT}`; ctx.textBaseline = "middle"; ctx.textAlign = "center";
    const label = fx.text; const tw = ctx.measureText(label).width; const w = tw + fs * 1.4, h = fs * 1.9;
    const cx = W - w / 2 - W * 0.06, cy = H * 0.24;
    ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 5) * 0.06 - 0.08); ctx.scale(s, s);
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = fs * 0.5; ctx.shadowOffsetY = fs * 0.12;
    ctx.fillStyle = "#ff3b5c"; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
    ctx.shadowColor = "transparent"; ctx.lineWidth = fs * 0.12; ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.fillText(label, 0, fs * 0.04);
  } else {
    const fs = Math.round(base * 0.13); ctx.font = `900 ${fs}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const sc = 0.85 + 0.15 * easeOut(t / 0.3); ctx.globalAlpha = clamp(t / 0.25) * out;
    ctx.translate(W / 2, H * 0.4); ctx.scale(sc, sc);
    ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = fs * 0.3; ctx.lineWidth = fs * 0.08; ctx.strokeStyle = "rgba(0,0,0,.45)";
    const s = countText(fx.text, t); ctx.strokeText(s, 0, 0); ctx.fillStyle = "#ffd43b"; ctx.fillText(s, 0, 0);
  }
  ctx.restore();
}
