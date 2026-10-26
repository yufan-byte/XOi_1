/**
 * 站内公告（官方公告）—— 站长在控制台直接编辑，主站菜单红点即时生效。
 *
 * 为什么要写文件而不是建表：
 *   主站（Vue）读的是静态 `/announcements.json`（backend/data/web/announcements.json，
 *   由 app.ts 的 express.static(webDir) 直接伺服），未读红点靠「最新一条 id ≠ localStorage 记录」判定。
 *   公告是**低频、少量、纯展示**的内容，为它建表反而要同步两条链路；直接读写这个 JSON 即可，
 *   站长改完刷新主站就能看到，不用重构建、不用重启。
 *
 * 形状（与主站约定一致，别改）：
 *   { "data": [ { "id": string, "title": string, "content": string, "type"?: "notice"|"update"|"maintenance", "published_at"?: "YYYY-MM-DD" } ] }
 *
 * 鉴权：/api/admin 前缀已统一套 requireAdmin（app.ts），本文件不重复校验。
 */
import express from "express";
import { AnnouncementsStore } from "@/utils/announcementsStore";
import { success, error } from "@/lib/responseFormat";

const router = express.Router();

const store = new AnnouncementsStore();
const TYPES = ["notice", "update", "maintenance"];
const LIMITS = { items: 50, title: 80, content: 20000, bannerText: 120, bannerCta: 12, bannerLink: 300 };
const BANNER_THEMES = ["brand", "dark", "green"];

interface Announcement { id: string; title: string; content: string; type?: string; published_at?: string }
/** 全站顶部横幅：管理员发布后出现在所有用户页面顶部，可关闭、可配置跳转 */
interface SiteBanner { id: string; enabled: boolean; text: string; ctaLabel: string; link: string; theme: string }

async function readItems(): Promise<Announcement[]> {
  const {data}=await store.read();
  return data.filter((x): x is Announcement => !!x && typeof (x as Announcement).id === "string" && typeof (x as Announcement).title === "string");
}

async function readBanner(): Promise<SiteBanner | null> {
  const { banner } = await store.read();
  return banner as SiteBanner | null;
}

/**
 * 横幅跳转链接白名单。
 * 防 SSRF/注入的边界：这个 JSON 是纯静态文件，**服务端从不按它回源任何地址**，
 * 风险面只在浏览器端跳转（javascript: 伪协议 = XSS、开放重定向）。策略收紧到两种形态：
 *   1. 站内路径（/ 开头，拒绝 // 协议相对形态）→ 前端 router 内部跳转；
 *   2. https:// 绝对地址 → 新窗口打开（rel=noopener）。
 * 其余（javascript:、data:、http:、//example.com 等）一律 400，不猜不修正。
 */
function sanitizeBannerLink(link: string): string {
  if (!link) return "";
  if (link.startsWith("/") && !link.startsWith("//")) return link.slice(0, LIMITS.bannerLink);
  if (/^https:\/\//i.test(link)) return link.slice(0, LIMITS.bannerLink);
  throw new Error("跳转链接仅支持站内路径（/ 开头）或 https:// 外链");
}

function normalizeBanner(raw: unknown): SiteBanner {
  const b = (raw ?? {}) as Record<string, unknown>;
  const enabled = Boolean(b?.enabled);
  const text = String(b?.text ?? "").trim().slice(0, LIMITS.bannerText);
  const ctaLabel = String(b?.ctaLabel ?? "").trim().slice(0, LIMITS.bannerCta);
  const theme = BANNER_THEMES.includes(String(b?.theme)) ? String(b?.theme) : "brand";
  let link = "";
  try { link = sanitizeBannerLink(String(b?.link ?? "").trim()); }
  catch (e) { throw new Error((e as Error).message); }
  if (enabled && !text) throw new Error("开启横幅必须填写文案");
  return { id: String(b?.id ?? "").trim() || `banner-${Date.now().toString(36)}`, enabled, text, ctaLabel, link, theme };
}

/** 生成稳定 id：日期 + 4 位随机（主站用 id 判未读，换 id 就会重新亮红点，所以只在新建时生成） */
function newId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${Math.random().toString(36).slice(2, 6)}`;
}

router.get("/", async (_req, res) => {
  try {
    res.send(success({ items: await readItems(), banner: await readBanner() }));
  } catch (e) {
    res.status(500).send(error(`读取公告失败：${(e as Error).message}`));
  }
});

router.put("/", async (req, res) => {
  const raw = (req.body ?? {}) as { items?: unknown; banner?: unknown };
  if (!Array.isArray(raw.items)) return res.status(400).send(error("请求体需要 { items: [...] }"));

  const items: Announcement[] = [];
  for (const it of raw.items as Array<Record<string, unknown>>) {
    const title = String(it?.title ?? "").trim();
    const content = String(it?.content ?? "").trim();
    if (!title) return res.status(400).send(error("每条公告都要有标题"));
    if (content.length > LIMITS.content) return res.status(400).send(error(`公告正文最多 ${LIMITS.content} 字`));
    const type = TYPES.includes(String(it?.type)) ? String(it.type) : "notice";
    items.push({
      id: String(it?.id ?? "").trim() || newId(),
      title: title.slice(0, LIMITS.title),
      content,
      type,
      published_at: String(it?.published_at ?? "").trim() || new Date().toISOString().slice(0, 10),
    });
  }
  if (items.length > LIMITS.items) return res.status(400).send(error(`最多保留 ${LIMITS.items} 条公告`));
  const ids = new Set(items.map((i) => i.id));
  if (ids.size !== items.length) return res.status(400).send(error("公告 id 有重复"));

  // banner 未随请求携带时保留线上现值（公告列表与横幅是两个编辑区，保存公告不能抹掉横幅）。
  let banner: SiteBanner | null;
  try { banner = raw.banner === undefined ? await readBanner() : normalizeBanner(raw.banner); }
  catch (e) { return res.status(400).send(error((e as Error).message)); }

  try {
    await store.write(items, banner);
    res.send(success({ items, banner }));
  } catch (e) {
    res.status(500).send(error(`保存公告失败：${(e as Error).message}`));
  }
});

export default router;
