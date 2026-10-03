"use client";
// API 密钥的新建 / 编辑表单：字段与 new-api /api/token/ 对齐（基本信息 / 额度设置 / 高级设置）
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as Pop from "@radix-ui/react-popover";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useCatalog } from "@/lib/queries";
import { MODALITY_LABEL, channelNote, groupKeyOf, type CatalogModel, type Modality } from "@/lib/models";
import { matchTokenGroups } from "@/lib/token-groups";
import { cn, QUOTA_PER_UNIT } from "@/lib/utils";
import { accountPrimaryBtn, accountSecondaryBtn } from "./account-dialog-shell";

export interface Token {
  id: number; name: string; key: string; status: number; created_time: number; accessed_time?: number; expired_time: number;
  remain_quota: number; unlimited_quota: boolean; used_quota?: number; group?: string;
  model_limits_enabled?: boolean; model_limits?: string; allow_ips?: string; cross_group_retry?: boolean;
  /** 智能调度参与的分组（group === "auto" 时有效），new-api 的 auto_groups */
  auto_groups?: string[];
}

export const fieldCls = "h-[40px] w-full rounded-[4px] border border-border bg-card px-[13.2px] py-[4.4px] text-[15.4px] font-medium outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";
export const labelCls = "mb-[6.6px] flex gap-[8.8px] text-[15.4px] font-medium leading-[15.4px]";
const sectionCls = "mb-[8.8px] text-[13.2px] font-semibold leading-[17.6px] text-muted-foreground";
const hintCls = "mt-[4.4px] text-[11.5px] font-medium leading-[17.6px] text-muted-foreground";
const popCls = "z-[70] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-[10px] border border-border bg-card p-[4.4px] shadow-[0_12px_32px_-12px_rgba(20,20,31,0.35)] animate-in fade-in-0 zoom-in-95";
const rowCls = "flex w-full cursor-pointer items-center justify-between gap-[8.8px] rounded-[6px] px-[8.8px] py-[6.6px] text-left text-[13.2px] font-medium outline-none hover:bg-muted focus-visible:bg-muted";

/** datetime-local 的本地时间字符串（YYYY-MM-DDTHH:mm） */
const toLocalInput = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const QUICK: [string, number][] = [["1 个月", 30 * 86400_000], ["1 天", 86400_000], ["1 小时", 3600_000]];

/** 可选分组：/api/pricing 的 usable_group + group_ratio；auto-groups 有值时追加「智能调度」。任一请求失败都退回 default */
export function useTokenGroups() {
  const { data } = useCatalog();
  const { data: auto } = useQuery({ queryKey: ["token-auto-groups"], staleTime: 5 * 60_000, retry: false, queryFn: () => api<{ groups?: string[] }>("/api/token/auto-groups").catch(() => null) });
  return useMemo(() => {
    const usable = data?.usableGroup ?? {}; const raw = data?.groupRatio ?? {}; const f = data?.factor ?? 1;
    // 代理客户的实际倍率 = 平台倍率 × (1 + 代理加价%)，和目录里的报价口径一致
    const ratio: Record<string, number> = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v) * f]));
    // 只列真正有模型可用的分组：UserUsableGroups 里的 vip 分组下面一个渠道都没有，选了它的密钥
    // 每个请求都会失败（2026-09-18 巡检）。分组是否有货只看目录：任一模型的 enable_groups 含它即可。
    // 指定分组的密钥只能调这个分组里的模型（如 GPT · Pro 企业号池只有 4 个 GPT 模型），
    // 选完才发现调不了别的模型很难自查，所以把覆盖数量和模型清单一并带出来；
    // 清单还用于「按模型名搜分组」——用户往往只知道要调哪个模型，不知道它归哪个分组。
    const byGroup = new Map<string, { id: string; name: string }[]>();
    for (const m of data?.models ?? []) for (const g of m.groups ?? []) {
      const arr = byGroup.get(g) ?? []; arr.push({ id: m.id, name: m.name }); byGroup.set(g, arr);
    }
    const stocked = new Set(byGroup.keys());
    const opts = Object.entries(usable).filter(([value]) => stocked.size === 0 || stocked.has(value))
      .map(([value, label]) => ({ value, label: label || value, ratio: ratio[value] as number | undefined, models: byGroup.get(value) ?? [], count: (byGroup.get(value) ?? []).length }));
    if (!opts.length) {
      const all = (data?.models ?? []).map((m) => ({ id: m.id, name: m.name }));
      opts.push({ value: "default", label: "默认分组", ratio: ratio.default, models: all, count: all.length });
    }
    return (auto?.groups?.length ? [{ value: "auto", label: "智能调度（自动选择分组）", ratio: undefined, models: [] as { id: string; name: string }[], count: 0 }, ...opts] : opts);
  }, [data, auto]);
}

/** 选中分组的一句话说明：指定分组等于把密钥钉在某条线路上，这里直接说明它是什么、覆盖哪些模型 */
function GroupNote({ group }: { group: string }) {
  const options = useTokenGroups();
  const cur = options.find((o) => o.value === group);
  const text = channelNote(cur?.label ?? "");
  if (!cur || group === "auto" || group === "default" || !text) return null;
  return <p className="mt-[6.6px] text-[11.5px] leading-[17px] text-muted-foreground">{text}</p>;
}

function GroupPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = useTokenGroups(); const [open, setOpen] = useState(false); const [q, setQ] = useState("");
  const cur = options.find((o) => o.value === value);
  // 搜索词先按分组名匹配，不中再按该分组的模型名 / 模型 ID 匹配（matchTokenGroups，见 token-groups.test.ts）：
  // 以前只匹配分组名，输入「GM-3.1 Flash TTS」这类模型名只会得到「没有匹配的分组」。
  const list = matchTokenGroups(options, q);
  return (
    <Pop.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
      <Pop.Trigger aria-label="分组" className={cn(fieldCls, "flex items-center justify-between gap-[8.8px] text-left")}><span className="truncate">{cur ? cur.label : value}{cur?.ratio !== undefined && <span className="ml-[6.6px] text-[12px] text-muted-foreground">{cur.ratio}x</span>}</span><ChevronDown className="h-[15px] w-[15px] shrink-0 text-muted-foreground" /></Pop.Trigger>
      <Pop.Portal><Pop.Content align="start" sideOffset={4} className={popCls}>
        <div className="relative mb-[4.4px]"><Search className="pointer-events-none absolute left-[8.8px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索分组或模型" aria-label="搜索分组或模型" className="h-[32px] w-full rounded-[6px] border border-border bg-muted/50 pl-[28px] pr-[8.8px] text-[13.2px] font-medium outline-none focus:ring-2 focus:ring-ring/30" /></div>
        <div className="max-h-[200px] overflow-y-auto">
          {list.length === 0 && <p className="px-[8.8px] py-[11px] text-[12px] text-muted-foreground">没有匹配的分组或模型</p>}
          {list.map((o) => <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); setQ(""); }} className={rowCls}><span className="min-w-0 truncate">{o.label}<span className="ml-[6.6px] font-mono text-[11px] text-muted-foreground">{o.value}</span></span><span className="flex shrink-0 items-center gap-[6.6px] text-[11.5px] text-muted-foreground">{o.hits.length > 0 ? `含 ${o.hits[0]}${o.hits.length > 1 ? ` 等 ${o.hits.length} 个` : ""}` : o.count > 0 && `${o.count} 个模型`}{o.ratio !== undefined && `${o.ratio}x`}{value === o.value && <Check className="h-[14px] w-[14px] text-primary" />}</span></button>)}
        </div>
      </Pop.Content></Pop.Portal>
    </Pop.Root>
  );
}

/** 一个「渠道」= 前台目录里的一个分组（系列 · 计费单位，与顶部线路切换、侧边栏折叠同一口径）。
 *
 *  为什么不用 new-api 的令牌分组：本站所有渠道都挂在 default 一个分组下（abilities 表只有 default），
 *  照搬 aicost 那种「令牌分组」多选只会得到一条「默认分组」，用户什么都选不了。而站内每条上游线路
 *  就是一个模型（seedance2.0-hs-720p 等），所以「可用渠道」直接映射成 model_limits：勾一个渠道 =
 *  把该组全部模型加入限制清单。精确到线路、不改后端、不动计费。 */
interface ChannelGroup { key: string; label: string; desc: string; featured: boolean; ids: string[] }

function useChannelGroups(): ChannelGroup[] {
  const { data } = useCatalog();
  return useMemo(() => {
    const by = new Map<string, { label: string; models: CatalogModel[] }>();
    for (const m of data?.models ?? []) {
      const key = groupKeyOf(m) ?? m.series; // 与侧栏同一套分组；没有分组的按系列归组
      const g = by.get(key) ?? { label: key, models: [] };
      g.models.push(m); by.set(key, g);
    }
    const groups = [...by.entries()].map(([key, g]) => {
      const vendors = [...new Set(g.models.map((m) => m.vendorLabel))].join(" / ");
      const cat = MODALITY_LABEL[g.models[0].category];
      // 说明行：厂商 · 类型 · 组内线路编号（没有编号的用展示名），重点推荐的 hs 线路排前面，超过 4 条截断
      const names = [...g.models].sort((a, b) => Number(b.featured) - Number(a.featured)).map((m) => m.groupItem ?? m.name);
      const list = names.length > 4 ? `${names.slice(0, 4).join(" / ")} 等 ${names.length} 条` : names.join(" / ");
      return { key, label: g.label, desc: `${vendors} · ${cat} · ${list}`, featured: g.models.some((m) => m.featured), ids: g.models.map((m) => m.id) };
    });
    // 重点推荐（hs 线路）置顶，其余保持目录顺序
    return [...groups.filter((g) => g.featured), ...groups.filter((g) => !g.featured)];
  }, [data]);
}

function ChannelPicker({ value, onChange, container }: { value: string[]; onChange: (v: string[]) => void; container: HTMLElement | null }) {
  const groups = useChannelGroups(); const [open, setOpen] = useState(false); const [q, setQ] = useState("");
  const on = (g: ChannelGroup) => g.ids.every((id) => value.includes(id));
  const partial = (g: ChannelGroup) => !on(g) && g.ids.some((id) => value.includes(id));
  const toggle = (g: ChannelGroup) => onChange(on(g) ? value.filter((id) => !g.ids.includes(id)) : [...value, ...g.ids.filter((id) => !value.includes(id))]);
  const kw = q.trim().toLowerCase(); const list = groups.filter((g) => !kw || g.label.toLowerCase().includes(kw) || g.desc.toLowerCase().includes(kw));
  const picked = groups.filter(on);
  return (
    <>
      <Pop.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
        <Pop.Trigger aria-label="可用渠道" className={cn(fieldCls, "flex h-auto min-h-[40px] items-center justify-between gap-[8.8px] py-[5px] text-left")}>
          <span className={cn("flex min-w-0 flex-wrap items-center gap-[4.4px]", !value.length && "text-muted-foreground/70")}>
            {!value.length ? "全部渠道（不限制）"
              : picked.length ? picked.map((g) => <span key={g.key} className="inline-flex h-[24px] items-center rounded-full bg-primary/10 px-[8.8px] text-[12px] font-medium text-primary">{g.label}</span>)
              : `已选 ${value.length} 个模型（高级设置里可查看）`}
            {picked.length > 0 && value.length > picked.reduce((n, g) => n + g.ids.length, 0) && <span className="text-[12px] text-muted-foreground">+ 部分模型</span>}
          </span>
          <ChevronDown className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
        </Pop.Trigger>
        {/* 外层弹窗（ApiKeysDialog）开着时 react-remove-scroll 会锁住 body，并拦掉「不在弹窗 DOM 子树内」的滚轮事件。
            下拉默认 portal 到 body，正好落在子树外 → 列表滚不动。挂到本弹窗的 Content 上就回到锁的范围内 */}
        <Pop.Portal container={container}><Pop.Content align="start" sideOffset={4} className={popCls}>
          <div className="relative mb-[4.4px]"><Search className="pointer-events-none absolute left-[8.8px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索渠道 / 线路" aria-label="搜索渠道" className="h-[32px] w-full rounded-[6px] border border-border bg-muted/50 pl-[28px] pr-[8.8px] text-[13.2px] font-medium outline-none focus:ring-2 focus:ring-ring/30" /></div>
          <div className="max-h-[280px] overflow-y-auto">
            {list.length === 0 && <p className="px-[8.8px] py-[11px] text-[12px] text-muted-foreground">没有匹配的渠道</p>}
            {list.map((g) => { const sel = on(g); return (
              <button key={g.key} type="button" aria-pressed={sel} onClick={() => toggle(g)} className={cn(rowCls, "items-start py-[7.7px]", sel && "bg-primary/[0.06]")}>
                <span className="min-w-0">
                  <span className="flex items-center gap-[6.6px]"><span className="truncate text-[13.5px] font-semibold">{g.label}</span>{g.featured && <span className="shrink-0 rounded-full bg-primary/10 px-[6.6px] py-px text-[10px] font-semibold leading-[14px] text-primary">重点推荐</span>}</span>
                  <span className="mt-[2px] block truncate text-[11.5px] font-medium text-muted-foreground">{g.desc}</span>
                </span>
                <span className="flex shrink-0 items-center gap-[6.6px] pt-[2px] text-[11px] text-muted-foreground">
                  <span className="rounded-sm bg-muted px-[5px] py-px leading-[16px]">{g.ids.length} 条线路</span>
                  <span className={cn("grid h-[16px] w-[16px] place-items-center rounded-[4px] border", sel ? "border-primary bg-primary text-primary-foreground" : partial(g) ? "border-primary/60 bg-primary/20" : "border-border")}>{sel && <Check className="h-[11px] w-[11px]" />}</span>
                </span>
              </button>); })}
          </div>
        </Pop.Content></Pop.Portal>
      </Pop.Root>
    </>
  );
}

/** 按能力勾选：一次把某一类模型（对话 / 图片 / 视频 / 语音）全放进模型限制里。
 *  上游 2026-09-21 把密钥权限改成多选并补齐了几类；我们的网关只有「模型白名单」这一个口子，
 *  所以把「类别」展开成该类别下的模型 id——效果一样，用户不用再一个个去勾几十个模型。 */
function ScopePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useCatalog();
  const cats: [Modality, string][] = [["chat", "对话"], ["image", "图片"], ["video", "视频"], ["audio", "语音"]];
  const idsOf = (c: Modality) => (data?.models ?? []).filter((m) => m.category === c).map((m) => m.id);
  const picked = (c: Modality) => { const ids = idsOf(c); return ids.length > 0 && ids.every((i) => value.includes(i)); };
  const toggle = (c: Modality) => {
    const ids = idsOf(c);
    onChange(picked(c) ? value.filter((v) => !ids.includes(v)) : [...new Set([...value, ...ids])]);
  };
  return (
    <div className="flex flex-wrap gap-[6px]">
      {cats.map(([c, label]) => {
        const on = picked(c); const n = idsOf(c).length;
        return (
          <button key={c} type="button" onClick={() => toggle(c)} disabled={!n} aria-pressed={on}
            className={cn("inline-flex h-[28px] items-center gap-[5px] rounded-full border px-[10px] text-[12px] disabled:opacity-40",
              on ? "border-primary/40 bg-primary/10 text-primary-strong" : "border-border hover:bg-accent")}>
            {label}<span className="text-muted-foreground">{n}</span>
          </button>
        );
      })}
      {value.length > 0 && <button type="button" onClick={() => onChange([])} className="inline-flex h-[28px] items-center rounded-full px-[10px] text-[12px] text-muted-foreground hover:text-foreground">清空</button>}
    </div>
  );
}

function ModelLimits({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useCatalog(); const [open, setOpen] = useState(false); const [q, setQ] = useState("");
  const options = useMemo(() => {
    const opts = (data?.models ?? []).map((m) => ({ value: m.id, label: m.name }));
    const known = new Set(opts.map((o) => o.value));
    return [...value.filter((v) => !known.has(v)).map((v) => ({ value: v, label: v })), ...opts]; // 保留目录里没有的历史模型
  }, [data, value]);
  const kw = q.trim().toLowerCase(); const list = options.filter((o) => !kw || o.value.toLowerCase().includes(kw) || o.label.toLowerCase().includes(kw));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <>
      <Pop.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
        <Pop.Trigger aria-label="模型限制" className={cn(fieldCls, "flex items-center justify-between gap-[8.8px] text-left")}><span className={cn("truncate", !value.length && "text-muted-foreground/70")}>{value.length ? `已选 ${value.length} 个模型` : "不限制（可调用全部模型）"}</span><ChevronDown className="h-[15px] w-[15px] shrink-0 text-muted-foreground" /></Pop.Trigger>
        <Pop.Portal><Pop.Content align="start" sideOffset={4} className={popCls}>
          <div className="relative mb-[4.4px]"><Search className="pointer-events-none absolute left-[8.8px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索模型" aria-label="搜索模型" className="h-[32px] w-full rounded-[6px] border border-border bg-muted/50 pl-[28px] pr-[8.8px] text-[13.2px] font-medium outline-none focus:ring-2 focus:ring-ring/30" /></div>
          <div className="max-h-[220px] overflow-y-auto">
            {list.length === 0 && <p className="px-[8.8px] py-[11px] text-[12px] text-muted-foreground">没有匹配的模型</p>}
            {list.map((o) => <button key={o.value} type="button" onClick={() => toggle(o.value)} className={rowCls}><span className="min-w-0 truncate">{o.label}{o.label !== o.value && <span className="ml-[6.6px] font-mono text-[11px] text-muted-foreground">{o.value}</span>}</span>{value.includes(o.value) && <Check className="h-[14px] w-[14px] shrink-0 text-primary" />}</button>)}
          </div>
        </Pop.Content></Pop.Portal>
      </Pop.Root>
      {value.length > 0 && <div className="mt-[6.6px] flex flex-wrap gap-[4.4px]">{value.map((v) => <span key={v} className="inline-flex items-center gap-[4.4px] rounded-full bg-muted px-[8.8px] py-[2.2px] font-mono text-[11px] font-medium">{v}<button type="button" aria-label={`移除 ${v}`} onClick={() => toggle(v)} className="text-muted-foreground hover:text-danger"><X className="h-[11px] w-[11px]" /></button></span>)}</div>}
    </>
  );
}

function SwitchRow({ id, label, hint, checked, onCheckedChange }: { id: string; label: string; hint?: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-[13.2px] rounded-[6px] border border-border/60 px-[13.2px] py-[8.8px]">
      <div className="min-w-0"><label htmlFor={id} className="text-[15.4px] font-medium leading-[22px]">{label}</label>{hint && <p className={hintCls}>{hint}</p>}</div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </div>
  );
}

/** 新建（token 为空）/ 编辑（token 有值）。挂载即初始化，关闭即卸载，无需手动重置 */
export function ApiKeyForm({ token, onOpenChange, onSaved }: { token: Token | null; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const edit = !!token;
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null); // 「可用渠道」下拉要 portal 到这里，见 ChannelPicker
  const [name, setName] = useState(token?.name ?? "");
  const [group, setGroup] = useState(token?.group || "default");
  const [cross, setCross] = useState(!!token?.cross_group_retry);
  const [autoGroups, setAutoGroups] = useState<string[]>(token?.auto_groups ?? []);
  const groupOptions = useTokenGroups();
  const autoCandidates = groupOptions.filter((o) => o.value !== "auto");
  const exp0 = token && token.expired_time > 0 ? toLocalInput(token.expired_time * 1000) : ""; // 原始过期时间：没被改动就不校验，已过期的密钥仍可编辑
  const [exp, setExp] = useState(exp0);
  const [count, setCount] = useState("1");
  const [unlimited, setUnlimited] = useState(token ? token.unlimited_quota : true);
  const quota0 = token && !token.unlimited_quota ? String(token.remain_quota / QUOTA_PER_UNIT) : "10"; // 原始额度：没被改动就不校验大于 0，已用尽的密钥仍可编辑
  const [quota, setQuota] = useState(quota0);
  const [models, setModels] = useState<string[]>(token?.model_limits ? token.model_limits.split(",").filter(Boolean) : []);
  const [ips, setIps] = useState(token?.allow_ips ?? "");
  const [adv, setAdv] = useState(!!token?.model_limits || !!token?.allow_ips);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim(); if (!n) { toast.error("请输入名称"); return; }
    const yuan = Number(quota);
    if (!unlimited && !(quota.trim() && Number.isFinite(yuan) && (yuan > 0 || quota === quota0))) { toast.error("请输入大于 0 的额度"); return; }
    const expTs = exp ? Math.floor(new Date(exp).getTime() / 1000) : -1;
    if (exp && exp !== exp0 && (!Number.isFinite(expTs) || expTs <= Date.now() / 1000)) { toast.error("过期时间需晚于当前时间"); return; }
    const n0 = Math.trunc(Number(count) || 1); const total = edit ? 1 : Math.min(Math.max(n0, 1), 100);
    const payload = {
      group, expired_time: expTs, unlimited_quota: unlimited, remain_quota: unlimited ? 0 : Math.round(yuan * QUOTA_PER_UNIT),
      model_limits_enabled: models.length > 0, model_limits: models.join(","), allow_ips: ips.trim(), cross_group_retry: group === "auto" ? cross : false,
      // 智能调度时把用户勾选的分组交给 new-api（最多 max_count 个）；非 auto 传 null 清空，避免旧值残留
      auto_groups: group === "auto" && autoGroups.length ? autoGroups : null,
    };
    setBusy(true);
    try {
      if (edit && token) {
        await api("/api/token/", { method: "PUT", body: JSON.stringify({ ...payload, id: token.id, name: n }) });
        toast.success("密钥已保存"); onSaved(); onOpenChange(false); return;
      }
      // 批量创建只能一个个 POST：记下成功数和首个错误，出错即停（多半是服务端令牌上限，继续试只会刷屏）
      let ok = 0; let err: Error | null = null;
      for (let i = 0; i < total; i++) {
        try { await api("/api/token/", { method: "POST", body: JSON.stringify({ ...payload, name: total > 1 ? `${n}-${Math.random().toString(36).slice(2, 6)}` : n }) }); ok += 1; }
        catch (e) { err = e as Error; break; }
      }
      if (ok > 0) onSaved(); // 只要建成一个就刷新列表
      if (!err) { toast.success(total > 1 ? `已创建 ${total} 个密钥` : "密钥已创建"); onOpenChange(false); }
      else if (ok > 0) { setCount(String(total - ok)); toast.error(`已创建 ${ok}/${total} 个密钥，其余失败：${err.message}`); } // 数量改成剩余数，再点一次不会重复整批
      else toast.error(err.message);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogPrimitive.Portal>
        {/* 必须有 Overlay：Radix 的滚动锁（react-remove-scroll）挂在 Overlay 上，只有「最后一个锁」生效。
            没有它时生效的是外层 ApiKeysDialog 的锁，本弹窗整个落在锁外，滚轮会被 preventDefault，表单和下拉都滚不动。
            本弹窗是 inset-0 不透明全屏，这层遮罩视觉上完全看不见 */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[59]" />
        <DialogPrimitive.Content ref={setContentEl} className="fixed inset-0 z-[60] flex flex-col rounded-[6px] border border-primary/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(248,247,252,0.98))] font-medium shadow-[0_0_40px_rgba(124,57,237,0.18)] outline-none animate-in fade-in-0 dark:bg-[linear-gradient(145deg,rgba(28,28,36,0.98),rgba(20,20,28,0.98))]">
          <div className="flex flex-col gap-[4.4px] border-b border-border/30 pb-[11px] pl-[26.4px] pr-[70.4px] pt-[17.6px]">
            <DialogPrimitive.Title className="text-[22px] font-bold leading-[22px]">{edit ? "编辑密钥" : "创建密钥"}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-[15.4px] leading-[26.4px] text-muted-foreground">{edit ? "修改分组、额度与访问限制，密钥本身不变。" : "创建后可随时在列表中查看和复制密钥。"}</DialogPrimitive.Description>
          </div>
          <div className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col gap-[22px] overflow-y-auto px-[26.4px] py-[17.6px]">
            <section>
              <h3 className={sectionCls}>基本信息</h3>
              <div className="grid gap-[13.2px] md:grid-cols-2">
                <div><label htmlFor="tk-name" className={labelCls}>名称<span className="text-danger">*</span></label><input id="tk-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：自动化脚本 / 客户端应用" className={fieldCls} autoFocus /></div>
                {/* 站上目前只有 default 一个分组：「智能调度」在单分组下没有意义，真实分组只有一个时整个字段都不摆出来，
                    将来真有多个分组会自动出现 */}
                {groupOptions.filter((o) => o.value !== "auto").length > 1 && <div><span className={labelCls}>分组</span><GroupPicker value={group} onChange={setGroup} /><GroupNote group={group} /></div>}
              </div>
              <div className="mt-[13.2px]">
                <span className={labelCls}>可用渠道</span>
                <ChannelPicker value={models} onChange={setModels} container={contentEl} />
                <p className={hintCls}>不选表示该密钥可调用全部渠道；勾选后只能调用所选渠道下的线路。需要精确到单条线路时到高级设置里改「模型限制」</p>
              </div>
              {group === "auto" && (
                <div className="mt-[13.2px] space-y-[13.2px]">
                  <div>
                    <span className={labelCls}>参与调度的分组</span>
                    {/* 对齐 aicost 的令牌分组多选：勾选的分组进入 auto_groups，不勾则由站点默认顺序调度 */}
                    <div className="flex flex-wrap gap-[6.6px]">
                      {autoCandidates.map((o) => { const on = autoGroups.includes(o.value); return (
                        <button key={o.value} type="button" aria-pressed={on}
                          onClick={() => setAutoGroups(on ? autoGroups.filter((g) => g !== o.value) : [...autoGroups, o.value])}
                          className={cn("inline-flex h-[30px] items-center gap-[6.6px] rounded-full border px-[11px] text-[12.5px] font-medium transition-colors", on ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground")}>
                          {on && <Check className="h-[13px] w-[13px]" />}{o.label}<span className="font-mono text-[11px] opacity-70">{o.value}</span>
                          {o.ratio !== undefined && <span className="rounded-sm bg-success/12 px-[5px] py-px text-[10px] leading-none text-success">{o.ratio}x 倍率</span>}
                        </button>); })}
                    </div>
                    <p className={hintCls}>不勾选时按站点默认顺序在全部可用分组间调度；勾选后只在所选分组内调度</p>
                  </div>
                  <SwitchRow id="tk-cross" label="跨分组重试" hint="当前分组的渠道全部失败时，自动换到其它可用分组重试" checked={cross} onCheckedChange={setCross} />
                </div>
              )}
              <div className="mt-[13.2px] grid gap-[13.2px] md:grid-cols-2">
                <div>
                  <label htmlFor="tk-exp" className={labelCls}>过期时间</label>
                  <input id="tk-exp" type="datetime-local" value={exp} onChange={(e) => setExp(e.target.value)} className={fieldCls} />
                  <div className="mt-[6.6px] flex flex-wrap gap-[4.4px]">
                    <button type="button" onClick={() => setExp("")} className={cn("h-[26px] rounded-full border px-[11px] text-[11.5px] font-medium transition-colors", exp ? "border-border/60 hover:bg-muted" : "border-primary/50 bg-primary/10 text-primary")}>永不</button>
                    {QUICK.map(([l, d]) => <button key={l} type="button" onClick={() => setExp(toLocalInput(Date.now() + d))} className="h-[26px] rounded-full border border-border/60 px-[11px] text-[11.5px] font-medium transition-colors hover:bg-muted">{l}</button>)}
                  </div>
                </div>
                {!edit && <div><label htmlFor="tk-count" className={labelCls}>数量</label><input id="tk-count" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="1" className={fieldCls} /><p className={hintCls}>一次创建多个密钥时，名称会自动追加随机后缀（最多 100 个）</p></div>}
              </div>
            </section>
            <section>
              <h3 className={sectionCls}>额度设置</h3>
              <SwitchRow id="tk-unlimited" label="不限额度" hint="关闭后该密钥只能消耗设定的额度，用尽即停止服务" checked={unlimited} onCheckedChange={setUnlimited} />
              {!unlimited && <div className="mt-[13.2px]"><label htmlFor="tk-quota" className={labelCls}>额度（¥）</label><input id="tk-quota" value={quota} onChange={(e) => setQuota(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="10" className={fieldCls} /><p className={hintCls}>额度从账户余额中扣减，不是额外充值</p></div>}
            </section>
            <section>
              <button type="button" aria-expanded={adv} onClick={() => setAdv((v) => !v)} className="flex items-center gap-[6.6px] text-[13.2px] font-semibold leading-[17.6px] text-muted-foreground transition-colors hover:text-foreground"><ChevronDown className={cn("h-[15px] w-[15px] transition-transform", !adv && "-rotate-90")} />高级设置</button>
              {adv && <div className="mt-[13.2px] grid gap-[13.2px]">
                <div><span className={labelCls}>模型限制</span>
                  <ScopePicker value={models} onChange={setModels} />
                  <div className="mt-[6px]"><ModelLimits value={models} onChange={setModels} /></div><p className={hintCls}>与上方「可用渠道」是同一份清单：这里可精确到单条线路</p></div>
                <div><label htmlFor="tk-ips" className={labelCls}>IP 白名单</label><textarea id="tk-ips" value={ips} onChange={(e) => setIps(e.target.value)} rows={4} placeholder={"每行一个，支持 CIDR，例如：\n203.0.113.7\n198.51.100.0/24"} className={cn(fieldCls, "h-auto py-[8.8px] font-mono text-[13.2px] leading-[20px]")} /><p className={hintCls}>留空表示不限制。IP 可以被伪造，白名单只是辅助手段，不能替代对密钥本身的保密</p></div>
              </div>}
            </section>
          </div>
          <div className="flex justify-end gap-[8.8px] border-t border-border/30 px-[26.4px] py-[11px]">
            <button type="button" disabled={busy} onClick={() => onOpenChange(false)} className={cn(accountSecondaryBtn, "h-[40px]")}>关闭</button>
            <button type="button" disabled={busy} onClick={submit} className={cn(accountPrimaryBtn, "px-[17.6px]")}>{busy ? "保存中..." : "保存"}</button>
          </div>
          <DialogPrimitive.Close aria-label="关闭" className="absolute right-[17px] top-[19px] grid h-[40px] w-[40px] place-items-center rounded-[10px] border border-border/35 bg-white/20 text-muted-foreground/70 hover:bg-muted hover:text-foreground"><X size={18} /></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
