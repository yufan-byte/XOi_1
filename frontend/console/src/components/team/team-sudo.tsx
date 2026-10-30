"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api } from "@/lib/api";

/**
 * 团队敏感操作前的「安全复核」（sudo）。
 *
 * 未开启动态口令 → 输入登录密码；已开启 → 输入验证器上的 6 位口令（或救援码）。
 * 后端 `POST /api/team {action:"sudo"}` 校验通过后发一个 10 分钟有效、
 * 绑定当前会话版本的令牌；这里只负责在内存里缓存它。
 * 令牌不落 localStorage —— 刷新即失效，免得把「10 分钟免验证」变成永久后门。
 */
let cache: { token: string; expiresAt: number } = { token: "", expiresAt: 0 };

export function cachedSudoToken(): string | null {
  return cache.expiresAt > Date.now() ? cache.token : null;
}
export function clearSudoToken() {
  cache = { token: "", expiresAt: 0 };
}

export interface SudoDialogProps {
  reason: string;
  /** 账号是否已开启动态口令；true 时弹「输入 6 位口令」而不是密码框。 */
  mfaEnabled?: boolean;
  onDone: (token: string) => void;
  onClose: () => void;
}

export function SudoDialog({ reason, mfaEnabled = false, onDone, onClose }: SudoDialogProps) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const codeRef = useRef<HTMLInputElement | null>(null);
  const value = mfaEnabled ? code : password;

  useEffect(() => {
    if (mfaEnabled) codeRef.current?.focus();
  }, [mfaEnabled]);

  const submit = async () => {
    if (lock.current || !value) return;
    if (mfaEnabled && !/^[\d\s-]{6,20}$/.test(code.trim())) {
      toast.error("请输入 6 位动态口令");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const data = await api<{ token: string; expiresAt: number }>("/api/team", {
        method: "POST",
        body: JSON.stringify(mfaEnabled ? { action: "sudo", code: code.trim() } : { action: "sudo", password }),
      });
      cache = { token: data.token, expiresAt: Number(data.expiresAt) || Date.now() + 600_000 };
      onDone(data.token);
    } catch (error) {
      toast.error((error as Error).message);
      if (mfaEnabled) setCode("");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const input = "mt-3 h-10 w-full rounded-xl border bg-background px-3 outline-none";

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent
        title={mfaEnabled ? "输入动态口令" : "验证登录密码"}
        description={reason}
      >
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-6 text-muted-foreground">
          {mfaEnabled ? <Smartphone size={16} className="mt-0.5 shrink-0 text-primary" /> : <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />}
          <span>
            这是高风险操作。验证通过后 10 分钟内免重复验证；账号密码修改、异地登录或关闭动态口令都会让验证立即失效。
          </span>
        </div>

        {mfaEnabled ? (
          <div className="mt-3 space-y-2">
            <input
              ref={codeRef}
              aria-label="6 位动态口令"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={20}
              value={code}
              disabled={busy}
              onChange={(event) => setCode(event.target.value.replace(/[^\d\s-]/g, ""))}
              onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
              placeholder="验证器上的 6 位口令（手机丢了可用救援码）"
              className={`${input} text-center font-mono text-lg tracking-[0.3em]`}
            />
            <p className="text-xs text-muted-foreground">口令每 30 秒刷新一次；同一个口令用过一次后需等待下一个。</p>
          </div>
        ) : (
          <input
            aria-label="当前登录密码"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
            placeholder="输入你的登录密码"
            className={input}
          />
        )}

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
          <Button disabled={busy || !value} onClick={() => void submit()}>{busy ? "验证中…" : "验证"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
