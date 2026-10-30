"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, KeyRound, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/**
 * 团队管理员的动态口令（MFA）绑定。
 *
 * 流程：生成密钥 → 扫码 → 输一次验证码确认 → 拿到 10 个救援码（只显示一次）。
 * 密钥只在绑定的那一次离开过服务端（要画二维码），之后库里存的始终是密文。
 */
export interface MfaState {
  enabled: boolean; enrolledAt: number | null; confirmedAt: number | null; recoveryRemaining: number;
  digits: number; period: number;
}

export function MfaCard({ initial, onChange }: { initial: MfaState; onChange?: (next: MfaState) => void }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"idle" | "binding" | "codes">("idle");
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");

  useEffect(() => { setState(initial); }, [initial]);

  const reload = async () => {
    const next = await api<MfaState>("/api/team/mfa");
    setState(next);
    onChange?.(next);
    return next;
  };

  const startEnroll = async () => {
    setBusy(true);
    try {
      const data = await api<{ secret: string; otpauthUrl: string }>("/api/team/mfa", {
        method: "POST", body: JSON.stringify({ action: "mfaEnroll" }),
      });
      setSecret(data.secret);
      setQr(await QRCode.toDataURL(data.otpauthUrl, { margin: 1, width: 200, color: { dark: "#2b2622", light: "#fffdf9" } }));
      setStage("binding");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(code.trim())) { toast.error("请输入 6 位动态口令"); return; }
    setBusy(true);
    try {
      const data = await api<{ enabled: boolean; recoveryCodes: string[] }>("/api/team/mfa", {
        method: "POST", body: JSON.stringify({ action: "mfaConfirm", code: code.trim() }),
      });
      setRecovery(data.recoveryCodes);
      setStage("codes");
      await reload();
      toast.success("动态口令已开启");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!disablePassword) { toast.error("请输入登录密码"); return; }
    setBusy(true);
    try {
      await api("/api/team/mfa", { method: "POST", body: JSON.stringify({ action: "mfaDisable", password: disablePassword }) });
      setStage("idle");
      setSecret(""); setCode(""); setRecovery([]); setDisablePassword("");
      await reload();
      toast.success("动态口令已关闭，救援码同时作废");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(recovery.join("\n"));
      toast.success("救援码已复制，请保存到安全的地方");
    } catch {
      toast.error("浏览器不允许复制，请手动抄写");
    }
  };

  const input = "mt-1 h-10 w-full rounded-xl border bg-background px-3 outline-none";

  if (stage === "codes") {
    return (
      <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 size={16} className="text-emerald-600" />动态口令已开启</div>
        <p className="text-xs leading-6 text-muted-foreground">
          下面是 <b>10 个一次性救援码</b>，只显示这一次。手机丢了、重置了验证器，就用它登录并完成后续操作；每个用过即作废。
          建议直接打印或抄在纸上，不要存在联网的备忘录里。
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-background p-3 font-mono text-xs">
          {recovery.map((item) => <div key={item} className="tracking-wider">{item}</div>)}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => void copyCodes()}><Copy size={14} />复制</Button>
          <Button onClick={() => { setStage("idle"); setRecovery([]); }}>我已妥善保存</Button>
        </div>
      </div>
    );
  }

  if (stage === "binding" && qr) {
    return (
      <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><Smartphone size={16} className="text-primary" />用验证器 App 扫码</div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="MFA 绑定二维码" className="mx-auto h-[200px] w-[200px] rounded-xl border bg-white p-2 sm:mx-0" />
          <div className="flex-1 space-y-2 text-xs leading-6 text-muted-foreground">
            <p>支持 Google / Microsoft Authenticator、微信小程序里的动态口令等任意 TOTP 验证器。</p>
            <p>扫不出来就手动输入密钥：</p>
            <code className="block break-all rounded-lg border bg-background p-2 font-mono text-[11px]">{secret}</code>
          </div>
        </div>
        <label className="block text-xs text-muted-foreground">
          输入验证器上当前的 6 位口令完成绑定
          <input
            className={`${input} text-center font-mono text-lg tracking-[0.3em]`}
            inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            onKeyDown={(event) => { if (event.key === "Enter") void confirm(); }}
            placeholder="000000"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => { setStage("idle"); setSecret(""); setCode(""); }}>取消</Button>
          <Button disabled={busy || code.length !== 6} onClick={() => void confirm()}>
            {busy && <Loader2 size={14} className="mr-1 animate-spin" />}确认开启
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {state.enabled ? <ShieldCheck size={16} className="text-emerald-600" /> : <KeyRound size={16} className="text-muted-foreground" />}
          动态口令（MFA）
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${state.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
          {state.enabled ? "已开启" : "未开启"}
        </span>
      </div>

      <p className="text-xs leading-6 text-muted-foreground">
        开启后，批量建号、重置成员密码、导出账号密码这些高风险操作需要额外输入验证器上的 6 位口令。
        剩余可用救援码 <b className="text-foreground">{state.recoveryRemaining}</b> 个{state.recoveryRemaining <= 2 && state.enabled ? "，建议尽快重新绑定以刷新救援码" : ""}。
      </p>

      {state.enabled ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block flex-1 text-xs text-muted-foreground">
            关闭动态口令需验证登录密码
            <input type="password" autoComplete="current-password" className={input} value={disablePassword} onChange={(event) => setDisablePassword(event.target.value)} placeholder="输入登录密码" />
          </label>
          <Button variant="secondary" disabled={busy || !disablePassword} onClick={() => void disable()}>
            {busy && <Loader2 size={14} className="mr-1 animate-spin" />}<ShieldOff size={14} />关闭
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button disabled={busy} onClick={() => void startEnroll()}>
            {busy && <Loader2 size={14} className="mr-1 animate-spin" />}开启动态口令
          </Button>
        </div>
      )}
    </div>
  );
}
