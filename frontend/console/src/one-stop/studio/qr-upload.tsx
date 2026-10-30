// 扫码用手机上传（造物 QrUploadDialog + 本站中转接口）：
// 桌面端展示当前工作台二维码；手机扫码打开手机版上传页，选文件 POST 到 /api/one-stop-uploads，
// 桌面端轮询 GET /api/one-stop-uploads?since= 把新到的素材自动挂进对应上传格。
import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { OmniDialog } from "./ui";
import { accountKey, assertAccountSession, oneStopRequest } from "../adapters/request";
import type { RefKind } from "./media-page";

export interface PickupItem { id: string; name: string; kind: RefKind; url: string; bytes: number; created_at: number }

/** 手机版上传页：嵌入在上传弹窗的 iframe / 手机直接打开 /one-stop/#/upload 时渲染 */
export function PhoneUploadPage() {
  const [busy, setBusy] = useState(false);
  const transfer = new URLSearchParams(location.hash.split("?")[1] || "").get("transfer") || "";
  const send = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!/^[a-f0-9-]{36}$/.test(transfer)) return toast.error("请重新扫描电脑端当前上传二维码");
    const owner = assertAccountSession();
    setBusy(true);
    try {
      let ok = 0;
      for (const f of Array.from(files)) {
        if (f.size > 12 * 1048576) { toast.error(`「${f.name}」超过 12MB，请先压缩`); continue; }
        const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
        assertAccountSession(owner);
        await oneStopRequest("/api/one-stop-uploads", { method: "POST", body: JSON.stringify({ name: f.name, dataUrl, transfer }) });
        ok++;
      }
      if (ok) toast.success(`已上传 ${ok} 个素材，回到电脑点「取回」即可使用`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-lg font-bold text-foreground">扫码上传</h1>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">选择图片 / 视频 / 音频（单个 ≤12MB），上传后回到电脑端点「取回」就会出现在参考上传格里。</p>
        <label className="primary-gradient mt-6 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold text-white">
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}{busy ? "上传中…" : "选择文件上传"}
          <input type="file" multiple disabled={busy} accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => { void send(e.target.files); e.target.value = ""; }} />
        </label>
        <p className="mt-4 text-[11px] text-muted-foreground">需要与电脑端登录同一账号。</p>
      </div>
    </div>
  );
}

/** 桌面端弹窗：二维码 + 取回按钮（轮询 5 秒一次，有新素材自动回填） */
export function QrUploadDialog({ open, onOpenChange, onPickup }: { open: boolean; onOpenChange: (v: boolean) => void; onPickup: (items: PickupItem[]) => void }) {
  const [qr, setQr] = useState<string>("");
  const [items, setItems] = useState<PickupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const taken = useRef<Set<string>>(new Set());
  const channel = useRef<{id: string; owner: string} | null>(null);
  const [transfer, setTransfer] = useState("");
  const pickupUrl = transfer ? `${location.origin}/one-stop/#/upload?transfer=${transfer}` : "";
  useEffect(() => {
    if (!open) return;
    const session = {id: crypto.randomUUID(), owner: accountKey()};
    channel.current = session; taken.current.clear(); setItems([]); setQr(""); setLoading(false); setTransfer(session.id);
    const url = `${location.origin}/one-stop/#/upload?transfer=${session.id}`;
    import("qrcode").then((Q) => Q.toDataURL(url, { width: 220, margin: 1 })).then(value => {if (channel.current === session) setQr(value);}).catch(() => {});
    return () => { channel.current = null; };
  }, [open]);
  const fetchNew = async (toast_ = true) => {
    const session = channel.current;
    if (!session) return;
    setLoading(true);
    try {
      assertAccountSession(session.owner);
      const body = await oneStopRequest<{items: PickupItem[]}>(`/api/one-stop-uploads?transfer=${session.id}`);
      if (channel.current !== session) return;
      assertAccountSession(session.owner);
      const fresh: PickupItem[] = (Array.isArray(body.items) ? body.items : []).filter((x: PickupItem) => !taken.current.has(x.id));
      if (fresh.length) {
        for (const x of fresh) taken.current.add(x.id);
        setItems((c) => [...fresh, ...c].slice(0, 30));
        onPickup(fresh);
        toast.success(`取回 ${fresh.length} 个素材，已加入参考上传格`);
      } else if (toast_) toast.info("还没有新的扫码上传素材");
    } catch { if (toast_) toast.error("取回失败，请稍后重试"); }
    finally { if (channel.current === session) setLoading(false); }
  };
  // 打开时立即拉一次，随后 5 秒轮询（关闭即停）
  useEffect(() => {
    if (!open) return;
    void fetchNew(false);
    const timer = setInterval(() => void fetchNew(false), 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <OmniDialog open={open} onOpenChange={onOpenChange} bare title={<span className="text-xl font-bold leading-none">扫码用手机上传</span>} description={<span className="text-sm leading-6">手机扫码（或微信识别）打开上传页，选文件上传；电脑端会自动取回并挂进当前上传格。</span>} className="gap-4 overflow-y-auto p-6 sm:max-w-lg">
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="rounded-[10px] bg-white p-3 shadow-soft">{qr ? <img src={qr} alt="二维码" width={184} height={184} /> : <div className="h-[184px] w-[184px] shimmer rounded-[10px]" />}</div>
        <p className="max-w-[18rem] break-all text-center text-[11px] text-muted-foreground">{pickupUrl}</p>
        {items.length > 0 && (
          <div className="w-full space-y-1.5">
            <div className="text-left text-[11px] font-semibold text-muted-foreground">已取回 {items.length} 个：</div>
            <div className="max-h-28 space-y-1 overflow-y-auto">
              {items.map((x) => <div key={x.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-left text-[11px]"><span aria-hidden>{x.kind === "image" ? "▣" : x.kind === "video" ? "▶" : "♪"}</span><span className="min-w-0 flex-1 truncate text-foreground">{x.name}</span><span className="shrink-0 text-muted-foreground">{Math.max(1, Math.round(x.bytes / 1048576 * 10) / 10)}MB</span></div>)}
            </div>
          </div>
        )}
        <button type="button" onClick={() => void fetchNew()} className="chip h-9 gap-1.5 hover:bg-muted" disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}取回新素材
        </button>
      </div>
    </OmniDialog>
  );
}
