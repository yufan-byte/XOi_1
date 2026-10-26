"use client";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Globe, Globe2, Info, Link2, Palette, Save, Trash2, Type, Upload } from "lucide-react";
import { toast } from "sonner";
import { useResellerAll, useSaveSection } from "@/lib/reseller/client";
import { DEFAULT_DATA, type ResellerData, type SiteBrand, type SiteDomain, type SiteTheme } from "@/lib/reseller/types";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/shell/brand";
import { ImagePicker, LabeledSwitch, PHOTO_TYPES, SettingCard, UnderlineTabs, rootHost, useHost } from "./ui";
import { LoginVideoList } from "./login-videos";
import { SKINS, skinName } from "./skins";

type Tab = "brand" | "domain" | "theme";
const input = "h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50";

/** Archived UI only; not routed. Domain provisioning and login customization are not enabled. */
export function SiteInfo() {
  const { data, isLoading, error } = useResellerAll();
  if (isLoading) return <div className="h-[60vh] rounded-2xl shimmer" />;
  return <>{error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">加载失败：{(error as Error).message}（以下为默认配置）</div>}<SiteInfoForm initial={data ?? DEFAULT_DATA} /></>;
}

function SiteInfoForm({ initial }: { initial: ResellerData }) {
  const save = useSaveSection(); const host = useHost();
  const [tab, setTab] = useState<Tab>("brand");
  const [site, setSite] = useState<SiteBrand>({ ...DEFAULT_DATA.site, ...initial.site });
  const [savedSite, setSavedSite] = useState<SiteBrand>({ ...DEFAULT_DATA.site, ...initial.site });
  const [domain, setDomain] = useState<SiteDomain>({ ...DEFAULT_DATA.domain, ...initial.domain });
  const [theme, setTheme] = useState<SiteTheme>({ ...DEFAULT_DATA.theme, ...initial.theme });
  const [savedTheme, setSavedTheme] = useState<SiteTheme>({ ...DEFAULT_DATA.theme, ...initial.theme });
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<SiteBrand>) => setSite((s) => ({ ...s, ...p }));

  const saveAll = async () => {
    const next: SiteBrand = { ...site, name: site.name.trim(), subtitle: site.subtitle.trim(), footer: site.footer.trim() };
    if (next.name && (next.name.length < 2 || next.name.length > 50)) { toast.error("品牌名称需 2-50 字，或留空使用平台默认"); setTab("brand"); return; }
    if (next.subtitle.length > 60) { toast.error("品牌副标题最多 60 字"); setTab("brand"); return; }
    if (next.footer.length > 200) { toast.error("页脚文本最多 200 字"); setTab("brand"); return; }
    const siteChanged = JSON.stringify(next) !== JSON.stringify(savedSite); const themeChanged = JSON.stringify(theme) !== JSON.stringify(savedTheme);
    if (!siteChanged && !themeChanged) { toast.info("没有需要保存的更改"); return; }
    setBusy(true);
    try {
      if (siteChanged) { await save("site", next, "reseller.site.update"); setSite(next); setSavedSite(next); }
      if (themeChanged) { await save("theme", theme, "reseller.theme.update"); setSavedTheme(theme); }
      toast.success("已保存更改");
    } catch (e) { toast.error(`保存失败：${(e as Error).message}`); } finally { setBusy(false); }
  };
  /** 背景视频「设为当前展示」立即保存（基于已保存的主题，不夹带未保存的皮肤改动） */
  const selectVideo = async (url: string) => {
    const next = { ...savedTheme, loginVideo: url }; setBusy(true);
    try { await save("theme", next, "reseller.theme.loginVideo"); setSavedTheme(next); setTheme((t) => ({ ...t, loginVideo: url })); toast.success(url ? "已设为当前展示" : "已恢复平台默认视频"); }
    catch (e) { toast.error(`保存失败：${(e as Error).message}`); } finally { setBusy(false); }
  };

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h1 className="text-xl font-semibold tracking-tight text-foreground">站点信息</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">配置白标品牌、域名接入与登录页主题，客户看到的就是你的品牌。</p></div></header>
      <UnderlineTabs value={tab} onChange={setTab} tabs={[{ value: "brand", label: "白标配置" }, { value: "domain", label: "域名" }, { value: "theme", label: "主题管理" }]} />
      {tab !== "domain" && <div className="flex flex-wrap items-center justify-end gap-3"><button type="button" onClick={saveAll} disabled={busy} className="inline-flex h-11 items-center rounded-lg border border-primary/40 bg-primary px-4 text-sm font-semibold text-white shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_18%,transparent)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-60"><Save size={16} className="mr-1.5" />保存更改</button></div>}
      <div>
        {tab === "brand" && <BrandTab site={site} patch={patch} host={host} />}
        {tab === "domain" && <DomainTab domain={domain} setDomain={setDomain} host={host} />}
        {tab === "theme" && <ThemeTab theme={theme} setTheme={setTheme} savedSkin={savedTheme.skin} onSelectVideo={selectVideo} busy={busy} />}
      </div>
    </div>
  );
}

function BrandTab({ site, patch, host }: { site: SiteBrand; patch: (p: Partial<SiteBrand>) => void; host: string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr] xl:items-start">
      <div className="space-y-4">
        <SettingCard icon={<Type size={20} />} title="品牌名称" required help="显示在你的白标站导航和标题, 2-50 字. 留空用平台默认.">
          <input aria-label="品牌名称" value={site.name} maxLength={50} onChange={(e) => patch({ name: e.target.value })} placeholder="造物引擎" className={input} />
        </SettingCard>
        <SettingCard icon={<FileText size={20} />} title="品牌副标题" help="显示在 logo 旁品牌名下方，最多 60 字。留空则不显示副标题（想要可自行填写）。">
          <input aria-label="品牌副标题" value={site.subtitle} maxLength={60} onChange={(e) => patch({ subtitle: e.target.value })} placeholder="如: AI 大模型聚合平台" className={input} />
          <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
            <div><div className="font-medium">隐藏副标题</div><div className="text-sm text-muted-foreground">开启后 logo 旁不显示副标题（发抖音等平台宣传时避免“聚合平台”字样违规）。</div></div>
            <LabeledSwitch label="隐藏副标题" checked={site.hideSubtitle} onCheckedChange={(v) => patch({ hideSubtitle: v })} />
          </div>
        </SettingCard>
        <SettingCard icon={<Upload size={20} />} title="标识" help="此标识会同时用作品牌 Logo 和浏览器标签页图标 (favicon), 建议使用清晰的方形图片。">
          <ImagePicker value={site.logo} onChange={(logo) => patch({ logo })} label="上传标志" reuploadLabel="重新上传" removeLabel="移除 Logo" hint="PNG/JPG/WebP/SVG, ≤2MB" />
        </SettingCard>
        <SettingCard icon={<FileText size={20} />} title="页脚文本" help="页脚展示, 也可写品牌介绍 / 服务承诺. 建议 ≤ 200 字">
          <textarea aria-label="页脚文本" value={site.footer} maxLength={200} rows={4} onChange={(e) => patch({ footer: e.target.value })} className="w-full resize-y rounded-xl border bg-card px-4 py-3 text-[15px] outline-none focus:border-primary/50" />
          <div className="mt-1 text-right text-xs text-muted-foreground">{site.footer.length}/200</div>
        </SettingCard>
      </div>
      <aside className="self-start lg:sticky lg:top-[88px]">
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Info size={16} className="text-primary" />实时预览</div>
        <div className="overflow-hidden rounded-pane border bg-card">
          <div className="border-b px-4 py-2.5 text-sm text-muted-foreground">标题</div>
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <span className="flex gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#ec6a5e]" /><i className="h-2.5 w-2.5 rounded-full bg-[#f4bf4f]" /><i className="h-2.5 w-2.5 rounded-full bg-[#61c554]" /></span>
            <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-sm"><Globe size={14} className="shrink-0" /><span className="truncate">{host || "—"}</span></span>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* 未配置 Logo 时的预览必须与顶栏 BrandMark 一致，否则代理商在这里看到的默认标识
    和站点实际显示的是两个东西。这里直接复用组件，不要再复制一份 SVG 出来。 */}
{site.logo ? <img src={site.logo} alt="" className="h-9 w-9 rounded-lg object-contain" /> : <BrandMark size={36} />}
              <div className="min-w-0"><div className="truncate text-lg font-semibold">{site.name.trim() || "造物引擎"}</div>{!site.hideSubtitle && site.subtitle.trim() && <div className="truncate text-xs text-muted-foreground">{site.subtitle}</div>}</div>
            </div>
            <div className="mt-5 grid h-11 place-items-center rounded-xl bg-primary font-medium text-white" aria-hidden>继续</div>
            <div className="mt-4 border-b pb-3"><div className="text-sm text-muted-foreground">描述</div>{site.subtitle.trim() && !site.hideSubtitle && <div className="mt-1 text-sm">{site.subtitle}</div>}</div>
            <div className="pt-3"><div className="text-sm text-muted-foreground">页脚文案</div>{site.footer.trim() && <div className="mt-1 whitespace-pre-wrap break-words text-sm">{site.footer}</div>}</div>
          </div>
        </div>
      </aside>
    </div>
  );
}

const SENSITIVE = ["openai", "admin", "anthropic", "claude", "gemini", "google", "official", "root", "gov", "support"];
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const STATUS: Record<string, [string, string]> = { pending: ["审核中", "bg-[#fff8e6] text-warning"], approved: ["已生效", "bg-success/10 text-success"], active: ["已生效", "bg-success/10 text-success"], rejected: ["已拒绝", "bg-danger/10 text-danger"] };
const Badge = ({ s }: { s: string }) => STATUS[s] ? <span className={cn("rounded-full px-2 py-0.5 text-xs", STATUS[s][1])}>{STATUS[s][0]}</span> : null;

function DomainTab({ domain, setDomain, host }: { domain: SiteDomain; setDomain: (d: SiteDomain) => void; host: string }) {
  const save = useSaveSection(); const root = rootHost(host);
  const [sub, setSub] = useState(domain.subdomain); const [reason, setReason] = useState(domain.subdomainReason);
  const [aud, setAud] = useState<"global" | "cn">("global"); const [cd, setCd] = useState(""); const [busy, setBusy] = useState(false);
  const commit = async (next: SiteDomain, action: string, ok: string) => {
    setBusy(true);
    try { await save("domain", next, action); setDomain(next); toast.success(ok); return true; } catch (e) { toast.error(`提交失败：${(e as Error).message}`); return false; } finally { setBusy(false); }
  };
  const submitSub = async () => {
    const v = sub.trim().toLowerCase();
    if (!SUBDOMAIN.test(v)) { toast.error("1-32 字符，仅小写字母 / 数字 / 连字符，首尾不可为连字符"); return; }
    if (SENSITIVE.some((w) => v.includes(w))) { toast.error("子域名含敏感关键词，已自动拒绝"); return; }
    await commit({ ...domain, subdomain: v, subdomainReason: reason.trim(), subdomainStatus: "pending" }, "reseller.domain.subdomain", "已提交申请，等待审核");
  };
  const submitCustom = async () => {
    const v = cd.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!DOMAIN.test(v)) { toast.error("请输入有效的域名，如 example.com"); return; }
    if (root && (v === root || v.endsWith(`.${root}`))) { toast.error("平台域名请使用白标子域名申请"); return; }
    if (domain.customDomains.some((d) => d.domain === v)) { toast.error("该域名已提交过"); return; }
    if (await commit({ ...domain, customDomains: [...domain.customDomains, { domain: v, audience: aud, status: "pending", createdAt: Date.now() }] }, "reseller.domain.custom", "已提交申请，审核通过后按说明配置 DNS")) setCd("");
  };
  const removeCustom = (d: string) => commit({ ...domain, customDomains: domain.customDomains.filter((x) => x.domain !== d) }, "reseller.domain.custom.remove", "已移除");

  return (
    <div className="space-y-5">
      <SettingCard icon={<Link2 size={20} />} title="白标子域名" help="申请自定义子域名, admin 审核通过后自动生效. 含敏感关键词 (如 openai/admin) 自动拒." right={<span className="rounded-full bg-success/10 px-3 py-1 text-xs text-success">国内秒开，无需备案，推荐首选</span>}>
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">当前白标域名</span><span className="font-medium">{host || "—"}</span><span className="text-muted-foreground">→</span>{domain.subdomain && <><span className="font-mono">{domain.subdomain}.{root}</span><Badge s={domain.subdomainStatus} /></>}</div>
        <div className="mt-3 flex h-12 overflow-hidden rounded-xl border bg-card focus-within:border-primary/50">
          <span className="grid place-items-center bg-muted/60 px-3 text-sm text-muted-foreground">https://</span>
          <input aria-label="白标子域名" value={sub} maxLength={32} onChange={(e) => setSub(e.target.value.toLowerCase())} placeholder="tgdemo" className="min-w-0 flex-1 bg-transparent px-3 font-mono outline-none" />
          <span className="grid place-items-center bg-muted/60 px-3 font-mono text-sm text-muted-foreground">.{root || "—"}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">1-32 字符，仅小写字母 / 数字 / 连字符，首尾不可为连字符。保存后立即生效。</p>
        <label className="mt-4 block text-sm font-medium">申请理由 (选填)<input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="如: 推广 X 渠道" className={cn(input, "mt-2 font-normal")} /></label>
        <div className="mt-4 flex justify-end"><button type="button" disabled={busy} onClick={submitSub} className="h-11 rounded-xl bg-primary px-6 font-medium text-white hover:bg-primary-strong disabled:opacity-60">提交申请</button></div>
      </SettingCard>

      <SettingCard icon={<Globe2 size={20} />} title="自定义域名" help="把您自己的域名 (如 acme.com) 绑定到本平台. 提交后等待审核通过, 然后按下方说明配置 DNS, SSL 证书会自动签发.">
        <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-[#fff8e6] px-4 py-3 text-sm text-warning"><AlertTriangle size={16} />自定义域名不推荐（需备案），推荐改用白标子域名</div>
        {domain.customDomains.length === 0 ? <div className="mt-4 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">暂无自定义域名. 添加一个开始使用您自己的品牌域名访问.</div> : (
          <ul className="mt-4 divide-y rounded-xl border">
            {domain.customDomains.map((d) => <li key={d.domain} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><span className="font-mono font-medium">{d.domain}</span><span className="text-muted-foreground">{d.audience === "cn" ? "面向国内" : "面向全球"}</span><Badge s={d.status} /><span className="ml-auto text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleDateString("zh-CN")}</span><button type="button" disabled={busy} onClick={() => removeCustom(d.domain)} aria-label={`移除 ${d.domain}`} className="icon-btn h-8 w-8 hover:bg-muted hover:text-danger"><Trash2 size={15} /></button></li>)}
          </ul>
        )}
        <div className="mt-5 text-sm font-medium">目标用户群</div>
        <div role="radiogroup" aria-label="目标用户群" className="mt-2 grid gap-3 sm:grid-cols-2">
          {([["global", "面向全球", "海外访问快，无需备案"], ["cn", "面向国内", "国内加速，需备案"]] as const).map(([k, t, d]) => (
            <button key={k} type="button" role="radio" aria-checked={aud === k} onClick={() => setAud(k)} className={cn("flex items-start gap-3 rounded-xl border p-4 text-left", aud === k ? "border-primary bg-primary-tint" : "hover:bg-muted")}>
              <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border", aud === k && "border-primary")}>{aud === k && <span className="h-2 w-2 rounded-full bg-primary" />}</span>
              <span><span className="block font-medium">{t}</span><span className="block text-sm text-muted-foreground">{d}</span></span>
            </button>
          ))}
        </div>
        <label className="mt-5 block text-sm font-medium">添加新域名<input value={cd} onChange={(e) => setCd(e.target.value)} placeholder="example.com" className={cn(input, "mt-2 font-mono font-normal")} /></label>
        <div className="mt-4 rounded-xl border bg-muted/40 p-4 text-sm">
          <div className="text-muted-foreground">DNS 配置 (在您的域名商后台添加 CNAME 记录):</div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-card px-3 py-2 font-mono">CNAME  @  {host.split(":")[0] || "—"}</pre>
          <div className="mt-2 text-xs text-muted-foreground">{aud === "global" ? "全球边缘加速，海外访问快，无需备案" : "国内加速节点，域名需先完成 ICP 备案"}</div>
        </div>
        <div className="mt-4 flex justify-end"><button type="button" disabled={busy} onClick={submitCustom} className="h-11 rounded-xl bg-primary px-6 font-medium text-white hover:bg-primary-strong disabled:opacity-60">提交申请</button></div>
      </SettingCard>
    </div>
  );
}

const TEMPLATES = [
  { key: "", name: "平台默认", desc: "跟随平台默认登录页模板" },
  { key: "globe", name: "地球", desc: "3D 地球 + 作品展映，适合品牌展示" },
  { key: "minimal", name: "极简", desc: "纯色背景 + 居中登录框，加载最快" },
];

function ThemeTab({ theme, setTheme, savedSkin, onSelectVideo, busy }: { theme: SiteTheme; setTheme: React.Dispatch<React.SetStateAction<SiteTheme>>; savedSkin: string; onSelectVideo: (url: string) => void; busy: boolean }) {
  const [sub, setSub] = useState<"video" | "bg" | "tpl">("video");
  return (
    <div className="space-y-5">
      <SettingCard icon={<Palette size={20} />} title="站点皮肤" help="选择与超级管理后台相同的全局皮肤，保存后仅作用于你的代理站。">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SKINS.map((s) => { const on = theme.skin === s.key; return (
            <button key={s.key} type="button" aria-pressed={on} onClick={() => setTheme((t) => ({ ...t, skin: s.key }))} className={cn("rounded-pane border p-5 text-left transition-shadow hover:shadow-soft", on && "border-primary ring-2 ring-primary/30")}>
              <span className="flex h-20 overflow-hidden rounded-xl">{s.swatch.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}</span>
              <span className="mt-3 flex items-center justify-between"><span className="text-lg font-semibold">{s.name}</span>{on && <CheckCircle2 size={22} className="fill-primary text-white" />}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{s.desc}</span>
              <span className="mt-2 block text-xs text-muted-foreground">{s.support}</span>
            </button>
          ); })}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">皮肤是代理站唯一视觉配置源；未选择时继承平台默认，保存后不再受平台默认变更影响。</p>
        <div className="mt-2 text-sm">当前生效: <span className="font-medium">{skinName(savedSkin)}</span>{theme.skin !== savedSkin && <span className="ml-2 text-warning">已选择「{skinName(theme.skin)}」，点击「保存更改」后生效</span>}</div>
      </SettingCard>

      <div>
        <div role="tablist" className="inline-flex rounded-xl border bg-muted/50 p-1">
          {([["video", "背景视频"], ["bg", "自定义背景"], ["tpl", "自定义模板"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={cn("h-9 rounded-lg px-4 text-sm", sub === k ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>{l}</button>)}
        </div>
        <div className="mt-4">
          {sub === "video" && <div className="space-y-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Info size={16} />视频由平台统一管理，您可选择用于自己白标登录页的视频。</div><LoginVideoList value={theme.loginVideo} onSelect={onSelectVideo} busy={busy} /></div>}
          {sub === "bg" && (
            <SettingCard icon={<Upload size={20} />} title="自定义背景" help="上传一张图片作为白标登录页背景（设置后优先于背景视频）。保存更改后生效。">
              <ImagePicker value={theme.customBackground} onChange={(v) => setTheme((t) => ({ ...t, customBackground: v }))} label="上传背景图" removeLabel="移除背景" hint="PNG/JPG/WebP, ≤2MB, 建议 1920×1080" types={PHOTO_TYPES} size={96} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {theme.customBackground && <img src={theme.customBackground} alt="背景预览" className="mt-4 aspect-video w-full max-w-xl rounded-xl border object-cover" />}
            </SettingCard>
          )}
          {sub === "tpl" && (
            <SettingCard icon={<Palette size={20} />} title="自定义模板" help="选择白标登录页的布局模板。保存更改后生效。">
              <div role="radiogroup" aria-label="登录页模板" className="grid gap-3 sm:grid-cols-3">
                {TEMPLATES.map((t) => { const on = theme.customTemplate === t.key; return (
                  <button key={t.key || "default"} type="button" role="radio" aria-checked={on} onClick={() => setTheme((x) => ({ ...x, customTemplate: t.key }))} className={cn("rounded-xl border p-4 text-left", on ? "border-primary bg-primary-tint" : "hover:bg-muted")}>
                    <span className="block font-medium">{t.name}</span><span className="mt-1 block text-sm text-muted-foreground">{t.desc}</span>
                  </button>
                ); })}
              </div>
            </SettingCard>
          )}
        </div>
      </div>
    </div>
  );
}
