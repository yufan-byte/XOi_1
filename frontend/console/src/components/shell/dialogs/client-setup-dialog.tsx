"use client";
// 一键接入：把某把密钥直接配进常用客户端。
// CC Switch 走它自己的深链（ccswitch://v1/import?resource=provider&app=…），点一下就落进它的供应商列表；
// 其余软件给可直接粘贴的配置（环境变量 / TOML / Base URL + 密钥），每条都带最少的操作步骤。
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Download, ExternalLink, Loader2, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useCatalog } from "@/lib/queries";
import { cn } from "@/lib/utils";

const BRAND = "XOi";
/** 站点对外地址：用户在别的软件里填的就是它 */
const origin = () => (typeof window === "undefined" ? "" : window.location.origin);

/** 网关自带的客户端清单（系统设置 → 聊天链接）：站长在网关后台加一条，这里自动多一个按钮。
 *  占位符的替换口径与网关前端一致（含 Cherry / AionUI / DeepChat / AQBot 四家的私有配置块），
 *  这样后台配好的模板不用在我们这边再维护第二份。CC Switch 与「流畅阅读」只是个关键字，
 *  不是能直接打开的链接，交给下面的固定流程。 */
interface GatewayChat { name: string; template: string }
function useGatewayChats() {
  const q = useQuery({
    queryKey: ["gateway-chats"],
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      const r = await fetch("/api/status", { cache: "no-store" });
      const j = (await r.json()) as { data?: { chats?: Record<string, string>[] } };
      return (j.data?.chats ?? []).flatMap((row) => Object.entries(row).map(([name, template]) => ({ name, template })));
    },
  });
  return (q.data ?? []).filter((c) => /:\/\//.test(c.template) && !/^ccswitch/i.test(c.template));
}
/** 密钥在链接里要带 sk- 前缀（网关前端同样这么补） */
const skKey = (key: string) => { const k = key.trim(); return k ? (k.startsWith("sk-") ? k : `sk-${k}`) : ""; };
function fillTemplate(tpl: string, base: string, rawKey: string) {
  const key = skKey(rawKey);
  const blob = (o: unknown) => encodeURIComponent(b64(JSON.stringify(o)));
  if (tpl.includes("{cherryConfig}")) return tpl.replaceAll("{cherryConfig}", blob({ id: "new-api", baseUrl: base, apiKey: key }));
  if (tpl.includes("{aionuiConfig}")) return tpl.replaceAll("{aionuiConfig}", blob({ platform: "new-api", baseUrl: base, apiKey: key }));
  if (tpl.includes("{deepchatConfig}")) return tpl.replaceAll("{deepchatConfig}", blob({ id: "new-api", baseUrl: base, apiKey: key }));
  if (tpl.includes("{aqbotConfig}")) return tpl.replaceAll("{aqbotConfig}", `name=${encodeURIComponent(BRAND)}&baseurl=${encodeURIComponent(base)}&apikey=${encodeURIComponent(key)}&type=openai`);
  return tpl.replaceAll("{address}", encodeURIComponent(base)).replaceAll("{key}", key);
}

/** 复制到剪贴板：非 https 下 navigator.clipboard 不存在，退回 execCommand；都不行返回 false。
 *  这里的内容含明文密钥，失败时绝不能把原文显示出来。 */
async function copyToClipboard(text: string): Promise<boolean> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch { /* 无权限 */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

type Kind = "ccswitch" | "config";
interface Client {
  id: string; name: string; kind: Kind; desc: string;
  /** CC Switch 深链里的 app 值（它只认这几个） */
  app?: "claude" | "codex" | "gemini";
  /** 该客户端默认用哪一类模型 */
  pick?: "chat" | "claude" | "gpt";
  /** 配置文本（复制用） */
  text?: (ctx: { base: string; key: string; model: string }) => string;
  steps: string[];
}

const CLIENTS: Client[] = [
  { id: "cc-codex", name: "CC Switch · Codex", kind: "ccswitch", app: "codex", pick: "gpt",
    desc: "一键写进 CC Switch 的 Codex 供应商列表，切过去就能用。",
    steps: ["先装好 CC Switch 并打开", "点「一键导入」，浏览器会问是否打开 CC Switch，选是", "在 CC Switch 里切到这个供应商即可"] },
  { id: "cc-claude", name: "CC Switch · Claude Code", kind: "ccswitch", app: "claude", pick: "claude",
    desc: "一键写进 CC Switch 的 Claude Code 供应商列表。",
    steps: ["先装好 CC Switch 并打开", "点「一键导入」，浏览器会问是否打开 CC Switch，选是", "在 CC Switch 里切到这个供应商即可"] },
  { id: "cc-gemini", name: "CC Switch · Gemini CLI", kind: "ccswitch", app: "gemini", pick: "chat",
    desc: "一键写进 CC Switch 的 Gemini CLI 供应商列表。",
    steps: ["先装好 CC Switch 并打开", "点「一键导入」，浏览器会问是否打开 CC Switch，选是", "在 CC Switch 里切到这个供应商即可"] },
  { id: "claude-code", name: "Claude Code（命令行）", kind: "config", pick: "claude",
    desc: "两个环境变量，写进 shell 配置即可。",
    text: ({ base, key }) => `export ANTHROPIC_BASE_URL=${base}\nexport ANTHROPIC_AUTH_TOKEN=${key}`,
    steps: ["把这两行加进 ~/.zshrc 或 ~/.bashrc", "新开一个终端，运行 claude", "模型名直接用站内的模型 id"] },
  { id: "codex-cli", name: "Codex CLI", kind: "config", pick: "gpt",
    desc: "~/.codex/config.toml 里加一个 provider。",
    text: ({ base, key, model }) => [
      `[model_providers.zwyq]`, `name = "${BRAND}"`, `base_url = "${base}/v1"`, `env_key = "OPENAI_API_KEY"`, `wire_api = "responses"`, ``,
      `[profiles.zwyq]`, `model_provider = "zwyq"`, `model = "${model}"`, ``,
      `# 然后在终端里：export OPENAI_API_KEY=${key}`,
    ].join("\n"),
    steps: ["把这段加进 ~/.codex/config.toml", "导出 OPENAI_API_KEY 环境变量", "运行 codex --profile zwyq"] },
  { id: "openai", name: "Cherry Studio / ChatBox / LobeChat", kind: "config", pick: "chat",
    desc: "任何 OpenAI 兼容客户端：填 Base URL 和密钥即可。",
    text: ({ base, key, model }) => `Base URL / API 地址：${base}/v1\nAPI Key：${key}\n默认模型：${model}`,
    steps: ["在客户端里新建一个 OpenAI 兼容供应商", "Base URL 填上面那行（注意带 /v1）", "密钥粘贴进去，模型填站内的模型 id"] },
  { id: "cline", name: "Cline / Roo Code（VS Code）", kind: "config", pick: "chat",
    desc: "选 OpenAI Compatible，填这两项。",
    text: ({ base, key, model }) => `API Provider：OpenAI Compatible\nBase URL：${base}/v1\nAPI Key：${key}\nModel ID：${model}`,
    steps: ["插件设置里 API Provider 选 OpenAI Compatible", "Base URL 与密钥按上面填", "Model ID 填站内模型 id"] },
  { id: "openwebui", name: "Open WebUI / NextChat", kind: "config", pick: "chat",
    desc: "同样是 OpenAI 兼容，注意地址结尾带 /v1。",
    text: ({ base, key }) => `OPENAI_API_BASE_URL=${base}/v1\nOPENAI_API_KEY=${key}`,
    steps: ["在设置（或部署环境变量）里填这两项", "保存后刷新模型列表", "模型列表直接来自本站在售模型"] },
];

/** CC Switch 的「用量脚本」：导入后它按这段去查余额，供应商卡片上才会显示剩余多少。
 *  只用密钥查（站内 /v1/user/balance），不需要账号令牌，密钥不失效就一直有效。 */
const USAGE_SCRIPT = `({
  request: {
    url: "{{baseUrl}}/v1/user/balance",
    method: "GET",
    headers: { "Authorization": "Bearer {{apiKey}}", "User-Agent": "cc-switch/1.0" }
  },
  extractor: function (response) {
    if (response && response.is_active === false) {
      return { isValid: false, invalidMessage: response.message || "密钥无效" };
    }
    return {
      planName: "${BRAND}",
      remaining: response.balance,
      used: response.used,
      total: response.total,
      unit: response.unit || "CNY"
    };
  }
})`;

/** base64（UTF-8 安全）：深链要求 usageScript 用 base64 传 */
function b64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function ccswitchLink(c: Client, ctx: { base: string; key: string; model: string }, withUsage: boolean) {
  const p = new URLSearchParams({
    resource: "provider", app: c.app!, name: `${BRAND}`,
    endpoint: c.app === "claude" ? ctx.base : `${ctx.base}/v1`,
    apiKey: ctx.key, model: ctx.model, homepage: ctx.base, enabled: "true",
  });
  if (withUsage) {
    p.set("usageEnabled", "true");
    p.set("usageScript", b64(USAGE_SCRIPT));
    p.set("usageBaseUrl", ctx.base);
    p.set("usageApiKey", ctx.key);
  }
  return `ccswitch://v1/import?${p.toString()}`;
}

export function ClientSetupDialog({ open, onOpenChange, tokenName, getKey }: {
  open: boolean; onOpenChange: (v: boolean) => void; tokenName: string; getKey: () => Promise<string>;
}) {
  const { data } = useCatalog();
  const gateway = useGatewayChats();
  const chat = useMemo(() => (data?.models ?? []).filter((m) => m.category === "chat" && !m.needsGroup), [data]);
  const ready = chat.length > 0;   // 目录没加载出来时 preset() 会返回空串，配置里就是 model=""
  const preset = (pick: Client["pick"]) => {
    const want = pick === "claude" ? /^claude-/ : pick === "gpt" ? /^gpt-/ : /./;
    return (chat.find((m) => want.test(m.id) && !/-(enterprise|official)$/.test(m.id)) ?? chat[0])?.id ?? "";
  };
  const [model, setModel] = useState<string>("");
  const [withUsage, setWithUsage] = useState(true);   // 导入时带上余额查询
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const withKey = async (fn: (key: string) => void | Promise<void>, id: string) => {
    setBusy(id);
    try { await fn(await getKey()); } catch (e) { toast.error((e as Error).message || "拿密钥失败，请重试"); } finally { setBusy(null); }
  };
  const copyText = (c: Client) => withKey(async (key) => {
    const text = c.text!({ base: origin(), key, model: model || preset(c.pick) });
    // 明文 http 访问时 navigator.clipboard 是 undefined：以前 catch 里直接把含 sk- 的全文弹进 toast，
    // 与本弹窗「密钥不会显示在页面上」的承诺正相反。改成请用户手动复制。
    if (!(await copyToClipboard(text))) { toast.error("复制失败，请改用 https 访问后再试"); return; }
    setDone(c.id); setTimeout(() => setDone(null), 1800); toast.success("配置已复制，粘贴到软件里即可");
  }, c.id);
  const openCcswitch = (c: Client) => withKey(async (key) => {
    const link = ccswitchLink(c, { base: origin(), key, model: model || preset(c.pick) }, withUsage);
    window.location.href = link;
    setDone(c.id); setTimeout(() => setDone(null), 2500);
    toast.success("已唤起 CC Switch；没有反应就点下面的「复制链接」手动粘贴");
  }, c.id);
  const openGateway = (c: GatewayChat) => {
    // 先同步开一个空窗口再去取密钥：取密钥是一次真实的 POST，await 之后再 window.open
    // 会被 Safari / Firefox 当成非用户手势拦掉，而我们还照样提示「已唤起」。
    const w = window.open("", "_blank");
    return withKey(async (key) => {
      const url = fillTemplate(c.template, origin(), key);
      if (w && !w.closed) { w.location.href = url; toast.success(`已唤起 ${c.name}`); }
      else { window.location.href = url; }
    }, `gw:${c.name}`).catch((e) => { w?.close(); throw e; });
  };
  const copyLink = (c: Client) => withKey(async (key) => {
    const link = ccswitchLink(c, { base: origin(), key, model: model || preset(c.pick) }, withUsage);
    if (!(await copyToClipboard(link))) { toast.error("复制失败，请改用 https 访问后再试"); return; }
    toast.success("导入链接已复制");
  }, `${c.id}:link`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="一键接入" description={`把密钥「${tokenName}」配进常用客户端。密钥只在点击时取一次，不会显示在页面上。`} className="w-[min(94vw,720px)]">
        <label className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">默认模型
          <select value={model} onChange={(e) => setModel(e.target.value)} className="h-9 min-w-[220px] max-w-full rounded-xl border border-border/70 bg-transparent px-2 text-[13px] outline-none">
            <option value="">按客户端自动选择</option>
            {chat.map((m) => <option key={m.id} value={m.id}>{m.name}（{m.id}）</option>)}
          </select>
          <span className="text-[11px] font-normal text-muted-foreground">写进配置的默认模型，装好后还能在软件里改</span>
        </label>
        <label className="mt-2 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={withUsage} onChange={(e) => setWithUsage(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          导入 CC Switch 时一并配置余额显示
          <span className="text-[11px] text-muted-foreground">（它会用这把密钥定时查余额，卡片上直接显示剩余多少；CC Switch 导入前会把这段脚本给你过目）</span>
        </label>

        <div className="mt-3 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
          {CLIENTS.map((c) => (
            <section key={c.id} className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">{c.kind === "ccswitch" ? <ExternalLink size={14} className="text-primary" /> : <Terminal size={14} className="text-primary" />}{c.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.desc}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {c.kind === "ccswitch" ? (
                    <>
                      <button type="button" disabled={!!busy || !ready} onClick={() => void openCcswitch(c)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-50">
                        {busy === c.id ? <Loader2 size={13} className="animate-spin" /> : done === c.id ? <Check size={13} /> : <Download size={13} />}一键导入
                      </button>
                      <button type="button" disabled={!!busy || !ready} onClick={() => void copyLink(c)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs hover:bg-accent disabled:opacity-50"><Copy size={13} />复制链接</button>
                    </>
                  ) : (
                    <button type="button" disabled={!!busy || !ready} onClick={() => void copyText(c)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs hover:bg-accent disabled:opacity-50">
                      {busy === c.id ? <Loader2 size={13} className="animate-spin" /> : done === c.id ? <Check size={13} className="text-success" /> : <Copy size={13} />}复制配置
                    </button>
                  )}
                </div>
              </div>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[11.5px] leading-5 text-muted-foreground">{c.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            </section>
          ))}
        </div>
        {gateway.length > 0 && (
          <section className="mt-3 rounded-2xl border border-border/60 bg-card p-4">
            <h3 className="text-sm font-semibold">其它已支持的客户端</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">这份清单来自网关设置，点一下用当前密钥直接打开对应软件。</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {gateway.map((c) => (
                <button key={c.name} type="button" disabled={!!busy || !ready} onClick={() => void openGateway(c)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs hover:bg-accent disabled:opacity-50">
                  {busy === `gw:${c.name}` ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}{c.name}
                </button>
              ))}
            </div>
          </section>
        )}
        <p className={cn("mt-3 text-[11px] leading-5 text-muted-foreground")}>接口地址统一是 <code className="rounded bg-muted px-1 py-px font-mono">{origin()}</code>：OpenAI 兼容客户端填 <code className="rounded bg-muted px-1 py-px font-mono">/v1</code> 结尾，Claude Code 填根地址。所有客户端共用同一把密钥与余额。</p>
      </DialogContent>
    </Dialog>
  );
}
