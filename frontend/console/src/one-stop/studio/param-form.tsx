// 参数胶囊体系：造物 components/media/param-form.tsx 的全量移植。
// 上游 param_schema 按类型渲染：枚举→下拉、bool→开启/关闭、int→数字/滑杆、string→文本；
// 参数多时收进「更多参数」弹层，改过的自动回到工具条上。
import { useEffect, useState } from "react";
import * as S from "@radix-ui/react-select";
import * as Pop from "@radix-ui/react-popover";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { ParamField, ParamOption } from "@/lib/models";
import { cn } from "@/lib/utils";
import { benchChip, FLOAT_PANEL } from "./ui";

export interface ParamOpt { value: string; label: string; description?: string }
/** 上游 param_schema 里工作台用到、但 lib/models 的 ParamField 没声明的字段 */
export type Field = ParamField & {
  step?: number;
  /** 该参数会改变计费（上游标记）；工作台把这类胶囊高亮 */
  affects_l2?: boolean;
  max_items_by_mode?: Record<string, number>;
  enum_values_by_quality?: Record<string, string[]>;
  max_items_by_quality?: Record<string, number>;
  max_bytes?: number;
  options?: (ParamOption & { available_when?: Record<string, string[]>; unavailable_when?: Record<string, string[]>[] })[];
};
export type Schema = Record<string, ParamField>;
export type Values = Record<string, string | undefined>;
export const PILL = "h-[34px] rounded-full";
export const BOOL_OPTS: ParamOpt[] = [{ value: "1", label: "开启" }, { value: "0", label: "关闭" }];
const TRUE = /^(1|true|on|yes|开启)$/i;
const EMPTY = "__empty__";
const enc = (v: string) => (v === "" ? EMPTY : v);
const dec = (v: string) => (v === EMPTY ? "" : v);

export function ParamSelect({ label, value, options, onChange, className, active, accent, grid, hint }: { label: string; value: string; options: ParamOpt[]; onChange: (v: string) => void; className?: string; active?: boolean; accent?: boolean; grid?: boolean; hint?: string }) {
  const cur = options.find((o) => o.value === value);
  return (
    <S.Root value={enc(value)} onValueChange={(v) => onChange(dec(v))}>
      <S.Trigger aria-label={`${label}: ${cur?.label ?? value}`} title={`${label}: ${cur?.label ?? value}${hint ? ` · ${hint}` : ""}`} data-active={!!active} className={cn(className, benchChip(active), "max-w-full data-[state=open]:border-foreground/30 data-[state=open]:bg-muted data-[state=open]:text-foreground", accent && "border-primary/45 bg-primary/[0.07] text-primary hover:border-primary/60 data-[state=open]:border-primary/60 data-[state=open]:bg-primary/10 data-[state=open]:text-primary")}>
        <span className="min-w-0 truncate text-muted-foreground">{label}</span>
        <span className={cn("min-w-0 shrink-0 truncate", active && "font-semibold")}>{cur?.label ?? value}</span>
        <ChevronDown size={14} className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" side="top" align="start" sideOffset={6} className={cn("z-50 max-h-[min(646px,var(--radix-select-content-available-height))] overflow-hidden font-medium animate-in fade-in-0 zoom-in-95", FLOAT_PANEL, grid ? "w-[264px]" : "min-w-[max(var(--radix-select-trigger-width),12rem)]")}>
          <div className="px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          {hint && !grid && <div className="max-w-[18rem] px-2.5 pb-1 text-[11px] leading-4 text-muted-foreground/80">{hint}</div>}
          <S.Viewport className={cn(grid && "!grid grid-cols-5 gap-1")}>
            {options.map((o) => grid ? (
              <S.Item key={o.value} value={enc(o.value)} className="flex cursor-default select-none items-center justify-center rounded-xl border border-transparent py-1.5 text-xs outline-none transition-colors data-[highlighted]:bg-muted/70 data-[state=checked]:border-foreground/15 data-[state=checked]:bg-muted data-[state=checked]:font-semibold data-[state=checked]:text-foreground">
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ) : (
              <S.Item key={o.value} value={enc(o.value)} className="relative flex cursor-default select-none items-start justify-between gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-sm outline-none transition-[background,transform] duration-150 data-[highlighted]:translate-x-0.5 data-[highlighted]:bg-muted/70 data-[state=checked]:border-foreground/15 data-[state=checked]:bg-muted data-[state=checked]:shadow-[0_1px_3px_color-mix(in_srgb,var(--foreground)_5%,transparent)]">
                <div className="min-w-0"><div className="text-sm font-medium text-foreground"><S.ItemText>{o.label}</S.ItemText></div>{o.description && <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{o.description}</div>}</div>
                <S.ItemIndicator className="shrink-0 self-center text-foreground"><Check size={16} /></S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

/** 数字胶囊：int 参数（种子、自由秒数等），按 schema 的 min / max / step 约束 */
export function ParamNumber({ label, value, onChange, min, max, step, className, active, hint, unit, placeholder }: { label: string; value: string; onChange: (v: string) => void; min?: number; max?: number; step?: number; className?: string; active?: boolean; hint?: string; unit?: string; placeholder?: string }) {
  return (
    <label className={cn(className, benchChip(active), "cursor-text gap-1")} title={hint ? `${label} · ${hint}` : label}>
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <input type="number" inputMode="numeric" value={value} min={min} max={max} step={step ?? 1} placeholder={placeholder ?? (min != null && max != null ? `${min}-${max}` : "")} aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => { if (e.target.value === "") return; onChange(String(clampInt(e.target.value, min, max, step))); }}
        className="w-14 bg-transparent text-right text-[12px] font-semibold text-foreground outline-none [appearance:textfield] placeholder:font-normal placeholder:text-muted-foreground/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      {unit && <span className="text-muted-foreground">{unit}</span>}
    </label>
  );
}

/** 滑杆胶囊：slider 型 int 参数（压缩率、码率） */
export function ParamRange({ label, value, onChange, min, max, step, className, active, hint, unit }: { label: string; value: string; onChange: (v: string) => void; min: number; max: number; step?: number; className?: string; active?: boolean; hint?: string; unit?: string }) {
  const n = clampInt(value, min, max, step);
  return (
    <label className={cn(className, benchChip(active), "cursor-pointer gap-2")} title={hint ? `${label} · ${hint}` : `${label}: ${n}${unit ?? ""}`}>
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <input type="range" value={n} min={min} max={max} step={step ?? 1} aria-label={label} aria-valuetext={`${n}${unit ?? ""}`} onChange={(e) => onChange(e.target.value)} className="w-20 accent-[var(--primary)] sm:w-24" />
      <span className="min-w-[2ch] text-right text-[12px] font-semibold tabular-nums text-foreground">{n}{unit}</span>
    </label>
  );
}

/** 文本胶囊：string 参数（MJ 的 --参数追加、风格参考链接、排除内容等） */
export function ParamText({ label, value, onChange, className, active, hint, placeholder, wide }: { label: string; value: string; onChange: (v: string) => void; className?: string; active?: boolean; hint?: string; placeholder?: string; wide?: boolean }) {
  return (
    <label className={cn(className, benchChip(active), "cursor-text gap-1")} title={hint ? `${label} · ${hint}` : label}>
      <span className="min-w-0 shrink-0 truncate text-muted-foreground">{label}</span>
      <input type="text" value={value} placeholder={placeholder ?? "未填"} aria-label={label} onChange={(e) => onChange(e.target.value)} className={cn("bg-transparent text-[12px] font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/50", wide ? "w-40" : "w-24")} />
    </label>
  );
}

export function clampInt(v: string | number | undefined, min?: number, max?: number, step?: number) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = min ?? 0;
  if (step && step > 0 && min != null) n = min + Math.round((n - min) / step) * step;
  if (min != null) n = Math.max(min, n);
  if (max != null) n = Math.min(max, n);
  return n;
}

/** 生成数量 1x…Nx */
export const countOptions = (max = 50) => Array.from({ length: Math.max(1, Math.min(200, Math.floor(max))) }, (_, i) => ({ value: String(i + 1), label: `${i + 1}x` }));

/** 某个 schema 字段当前生效的原始取值：mode 用当前模式；否则用户选择优先，再退到 schema 默认值 */
export function valueOf(schema: Schema, key: string, values: Values, mode?: string): string | undefined {
  if (key === "mode" && mode) return mode;
  const v = values[key]; if (v !== undefined) return v;
  const f = schema[key] as Field | undefined; if (!f) return undefined;
  if (f.default !== undefined && f.default !== null) return String(f.default);
  const opt = f.options?.find((o) => o.is_default) ?? f.options?.[0]; if (opt) return String(opt.value);
  return f.enum?.[0];
}
/** available_when：每个依赖字段的当前值都得落在允许列表里。没写即恒可用 */
export function whenOk(aw: Record<string, string[]> | undefined, schema: Schema, values: Values, mode?: string) {
  if (!aw) return true;
  return Object.entries(aw).every(([k, allowed]) => { const cur = valueOf(schema, k, values, mode); return cur !== undefined && allowed.map(String).includes(cur); });
}
export function fieldAvailable(schema: Schema, key: string, values: Values, mode?: string) { return !!schema[key] && whenOk(schema[key].available_when, schema, values, mode); }
/** 选项级 unavailable_when：任一条的每个字段都命中当前取值，这个选项就不给 */
export function refusedNow(entries: Record<string, string[]>[] | undefined, schema: Schema, values: Values, mode?: string) {
  if (!entries?.length) return false;
  const cur = (k: string) => (schema[k]?.type === "bool" ? String(boolOf(schema, k, values)) : valueOf(schema, k, values, mode));
  return entries.some((e) => Object.entries(e).every(([k, vs]) => { const c = cur(k); return c !== undefined && vs.map(String).includes(c); }));
}
/** 枚举字段的可选项；选项自己的 available_when 也一并过滤 */
export function optionsOf(schema: Schema, key: string, values: Values, mode?: string): ParamOpt[] {
  const f = schema[key] as Field | undefined; if (!f) return [];
  type Raw = { value: string; label?: string; description?: string; available_when?: Record<string, string[]>; unavailable_when?: Record<string, string[]>[] };
  const raw: Raw[] = f.options ?? (f.enum ?? []).map((v) => ({ value: v, label: v }));
  const byQ = key !== "quality" ? (f as Field).enum_values_by_quality : undefined;
  const q = byQ ? pickOf(schema, "quality", values, mode) : undefined;
  const allowed = q !== undefined ? byQ?.[q] : undefined;
  return raw
    .filter((o) => whenOk(o.available_when, schema, values, mode))
    .filter((o) => !refusedNow(o.unavailable_when, schema, values, mode))
    .filter((o) => !allowed || allowed.includes(String(o.value)))
    .filter((o) => key !== "quality" || !mode || qualityFitsMode(schema, String(o.value), mode))
    .map((o) => ({ value: String(o.value), label: o.label ?? String(o.value), description: o.description }));
}
function qualityFitsMode(schema: Schema, q: string, mode: string) {
  const modes = (schema.mode as Field | undefined)?.enum_values_by_quality?.[q];
  return !modes || modes.includes(mode);
}
/** 按当前档位，某类参考素材最多能传几个；档位没限制时返回 undefined */
export function maxItemsByQuality(schema: Schema, key: string, values: Values, mode?: string): number | undefined {
  const f = schema[key] as Field | undefined; const byQ = f?.max_items_by_quality; if (!byQ) return undefined;
  const q = pickOf(schema, "quality", values, mode); return q !== undefined ? byQ[q] : undefined;
}
/** 枚举字段实际生效的值：选中值不在可选项里时回退到默认值，再退到第一项 */
export function pickOf(schema: Schema, key: string, values: Values, mode?: string, prefer?: string): string | undefined {
  const f = schema[key] as Field | undefined; const opts = optionsOf(schema, key, values, mode); if (!opts.length) return undefined;
  const cands = [values[key], prefer, f?.default == null ? undefined : String(f.default), f?.options?.find((o) => o.is_default)?.value];
  return cands.find((c) => c !== undefined && opts.some((o) => o.value === c)) ?? opts[0].value;
}
export function boolOf(schema: Schema, key: string, values: Values): boolean {
  const v = values[key]; if (v !== undefined && v !== "") return TRUE.test(v);
  const d = schema[key]?.default; return typeof d === "boolean" ? d : d != null && TRUE.test(String(d));
}
export function intOf(schema: Schema, key: string, values: Values): number | undefined {
  const f = schema[key] as Field | undefined; if (!f) return undefined;
  const raw = values[key] ?? (f.default == null ? undefined : String(f.default)); if (raw === undefined || raw === "") return undefined;
  return clampInt(raw, f.min, f.max, f.step);
}

/** 把 schema 参数按类型整理成请求体字段：bool → boolean、int → number、枚举/字符串 → string。
 *  不可用、上传型、空值一律不发；exclude 里的键由页面自己拼。 */
export function bodyParams(schema: Schema, values: Values, mode: string | undefined, exclude: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, f0] of Object.entries(schema)) {
    const f = f0 as Field;
    if (exclude.includes(k) || f.type === "upload" || !fieldAvailable(schema, k, values, mode)) continue;
    if (f.type === "bool") { out[k] = boolOf(schema, k, values); continue; }
    if (f.type === "int" && !f.enum && !f.options) { const n = intOf(schema, k, values); if (n !== undefined) out[k] = n; continue; }
    if (f.type === "string") { const s = values[k]?.trim(); if (s) out[k] = s; continue; }
    const v = pickOf(schema, k, values, mode); if (v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

/** Niji 引擎只接受 5 / 6 / 7（MJ 卡片说明：选 6.1 或 8.x 会直接提交失败） */
export const NIJI_VERSIONS = ["", "7", "6", "5.2", "5.1"];
/** 只差「模型版本」就能用的字段能解锁到的版本 */
export function unlockVersion(schema: Schema, key: string, values: Values, mode?: string): string | undefined {
  const aw = schema[key]?.available_when; const allowed = aw?.version?.map(String); if (!allowed || !schema.version) return undefined;
  const rest = Object.fromEntries(Object.entries(aw!).filter(([k]) => k !== "version"));
  if (!whenOk(rest, schema, values, mode)) return undefined;
  const niji = valueOf(schema, "bot_type", values, mode) === "NIJI_JOURNEY";
  return optionsOf(schema, "version", values, mode).map((o) => o.value).find((v) => allowed.includes(v) && (!niji || NIJI_VERSIONS.includes(v)));
}
/** 用户给字段填了「有意义」的值（非空、非默认、开关为开） */
function meaningful(f: Field, v: string) { return f.type === "bool" ? v === "1" : v.trim() !== "" && v !== String(f.default ?? ""); }

/** 单个 schema 参数的控件：按 type / ui_widget 选胶囊样式；不可用时不渲染 */
export function ParamControl({ schema, k, values, onChange, mode, prefer, className, relaxed }: { schema: Schema; k: string; values: Values; onChange: (k: string, v: string) => void; mode?: string; prefer?: string; className?: string; relaxed?: boolean }) {
  const f = schema[k] as Field | undefined; if (!f || f.type === "upload") return null;
  if (!relaxed && !fieldAvailable(schema, k, values, mode)) return null;
  const label = f.label?.zh ?? k; const active = !!f.affects_l2; const cls = relaxed ? cn(className ?? PILL, "opacity-60") : className ?? PILL;
  const hint = relaxed ? `当前版本不支持，改动后自动切换版本。${f.description ?? ""}` : f.description;
  if (f.type === "bool") return <ParamSelect label={label} value={boolOf(schema, k, values) ? "1" : "0"} options={BOOL_OPTS} onChange={(v) => onChange(k, v)} className={cls} active={active} hint={hint} />;
  if (f.type === "int" && !f.enum && !f.options) {
    const cur = values[k] ?? (f.default == null ? "" : String(f.default));
    if (f.ui_widget === "slider" && f.min != null && f.max != null) return <ParamRange label={label} value={cur} min={f.min} max={f.max} step={f.step} onChange={(v) => onChange(k, v)} className={cls} active={active} hint={hint} />;
    if ((f.ui_widget === "dropdown" || k === "count") && f.min != null && f.max != null && f.max - f.min < 200) {
      const opts = Array.from({ length: f.max - f.min + 1 }, (_, i) => ({ value: String(f.min! + i), label: k === "count" ? `${f.min! + i}x` : String(f.min! + i) }));
      return <ParamSelect label={label} value={cur || opts[0].value} options={opts} onChange={(v) => onChange(k, v)} className={cls} active={active} hint={hint} grid={opts.length > 6} />;
    }
    return <ParamNumber label={label} value={cur} min={f.min} max={f.max} step={f.step} onChange={(v) => onChange(k, v)} className={cls} active={active} hint={hint} />;
  }
  if (f.type === "string") return <ParamText label={label} value={values[k] ?? (f.default == null ? "" : String(f.default))} onChange={(v) => onChange(k, v)} className={cls} active={active} hint={hint} wide={f.ui_widget === "textarea"} />;
  const opts = optionsOf(schema, k, values, mode); if (!opts.length) return null;
  const val = pickOf(schema, k, values, mode, prefer) ?? opts[0].value;
  return <ParamSelect label={label} value={val} options={opts} onChange={(v) => onChange(k, v)} className={cls} active={active} hint={hint} grid={k === "count"} />;
}

export const OPEN_MORE_PARAMS = "mc:open-more-params";
export function openMoreParams(key?: string) { window.dispatchEvent(new CustomEvent(OPEN_MORE_PARAMS, { detail: { key } })); }

/** schema 里其余参数的胶囊。工具条上只留要紧的（影响价格的、用户改过的，再补到 maxInline 个），
 *  其余收进「更多参数」弹层；改过的参数会自动回到工具条上。 */
export function ParamPills({ schema, values, onChange, mode, only, exclude, defaults, maxInline = 3, prefer }: { schema: Schema; values: Values; onChange: (k: string, v: string) => void; mode?: string; only?: string[]; exclude?: string[]; defaults?: Record<string, string>; maxInline?: number; prefer?: string[] }) {
  const rank = (k: string) => { const i = prefer?.indexOf(k) ?? -1; return i < 0 ? Infinity : i; };
  const relaxed = (k: string) => !fieldAvailable(schema, k, values, mode) && unlockVersion(schema, k, values, mode) !== undefined;
  const keys = Object.keys(schema).filter((k) => (!only || only.includes(k)) && !exclude?.includes(k) && schema[k].type !== "upload" && (fieldAvailable(schema, k, values, mode) || relaxed(k))).sort((a, b) => rank(a) - rank(b));
  // 改了只差版本的字段：先记下值，再把版本切到能用的那一档
  const change = (k: string, v: string) => {
    onChange(k, v);
    const f = schema[k] as Field; if (!relaxed(k) || !meaningful(f, v)) return;
    const ver = unlockVersion(schema, k, values, mode); if (ver === undefined) return;
    onChange("version", ver);
    const label = optionsOf(schema, "version", values, mode).find((o) => o.value === ver)?.label ?? ver;
    toast.success(`「${f.label?.zh ?? k}」需要对应版本，已切到 ${label}`);
  };
  const [open, setOpen] = useState(false); const [focusKey, setFocusKey] = useState<string>();
  useEffect(() => {
    const on = (e: Event) => { setFocusKey((e as CustomEvent<{ key?: string }>).detail?.key); setOpen(true); };
    window.addEventListener(OPEN_MORE_PARAMS, on); return () => window.removeEventListener(OPEN_MORE_PARAMS, on);
  }, []);
  const changed = (k: string) => { const f = schema[k] as Field; const v = values[k]; return v !== undefined && v !== "" && String(v) !== String(defaults?.[k] ?? f.default ?? ""); };
  const pinned = keys.filter((k) => (schema[k] as Field).affects_l2 || changed(k));
  const budget = Math.max(maxInline, pinned.length);
  const inlineSet = new Set([...pinned, ...keys.filter((k) => !pinned.includes(k))].slice(0, budget));
  const rest = keys.filter((k) => !inlineSet.has(k)); const fold = rest.length > 1;
  const control = (k: string, className?: string) => <ParamControl key={k} schema={schema} k={k} values={values} onChange={change} mode={mode} prefer={defaults?.[k]} className={className} relaxed={relaxed(k)} />;
  return (
    <>
      {keys.filter((k) => !fold || inlineSet.has(k)).map((k) => control(k))}
      {fold && (
        <Pop.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setFocusKey(undefined); }}>
          <Pop.Trigger aria-label={`更多参数，共 ${rest.length} 项`} className={cn(benchChip(), PILL, "data-[state=open]:border-foreground/30 data-[state=open]:text-foreground")}><SlidersHorizontal size={14} className="shrink-0" /><span>更多参数</span><b className="font-semibold text-foreground">{rest.length}</b><ChevronDown size={14} className="shrink-0 opacity-60" /></Pop.Trigger>
          <Pop.Portal>
            <Pop.Content side="top" align="start" sideOffset={8} collisionPadding={12} className={cn("z-40 w-[min(94vw,620px)] animate-in fade-in-0 zoom-in-95", FLOAT_PANEL, "p-3")}>
              <div className="mb-2 flex items-center justify-between px-1"><span className="text-[13px] font-semibold">更多参数</span><span className="text-[11px] text-muted-foreground">改过的参数会回到工具条上</span></div>
              <div className="grid max-h-[52vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">{rest.map((k) => <div key={k} ref={(el) => { if (el && k === focusKey) setTimeout(() => { el.scrollIntoView({ block: "nearest" }); el.querySelector<HTMLElement>("input, button")?.focus(); }, 60); }} className={cn("rounded-full", k === focusKey && "ring-2 ring-primary/50")}>{control(k, cn(PILL, "w-full justify-between"))}</div>)}</div>
            </Pop.Content>
          </Pop.Portal>
        </Pop.Root>
      )}
    </>
  );
}
