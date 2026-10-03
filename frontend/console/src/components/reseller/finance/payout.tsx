"use client";
import { useEffect, useRef, useState } from "react";
import { Building2, CreditCard, FileUp, ImageUp, Inbox, Info, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PillSelect } from "@/components/ui/select";
import { cn, uid } from "@/lib/utils";
import type { PayoutProfile } from "@/lib/reseller/types";
import { EmptyBox, Field, VaultPanel, dateTimeFull, inputCls } from "@/components/reseller/common";
import { ACCOUNT_TYPES, useSaveFinance, type FinanceData } from "./finance";

/** 读图并压缩为 JPEG dataURL（最长边 1024）；PDF 等原样转 dataURL */
export async function fileToCompressedDataUrl(file: File, maxBytes = 4_000_000): Promise<string> {
  const raw = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  if (!file.type.startsWith("image/")) { if (file.size > maxBytes) throw new Error("文件过大（最大 4MB）"); return raw; }
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("图片无法读取")); i.src = raw; });
  const scale = Math.min(1, 1024 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.85);
}

const legacyField = "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-primary/50";
const legacyEmpty = (title: string, desc: string) => <div className="rounded-[24px] border border-border/55 bg-muted/30 px-6 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border/45 bg-muted text-muted-foreground"><Inbox size={24} /></div><div className="mt-4 text-lg font-semibold text-foreground">{title}</div><div className="mt-2 text-sm leading-7 text-muted-foreground">{desc}</div></div>;

export function AccountsTab({ d, variant }: { d?: FinanceData; variant?: "legacy" }) {
  const saveFinance = useSaveFinance(); const [type, setType] = useState("alipay"); const [note, setNote] = useState(""); const [qr, setQr] = useState(""); const [busy, setBusy] = useState(false); const fileRef = useRef<HTMLInputElement>(null);
  const accounts = d?.accounts ?? [];
  const pick = async (f?: File) => { if (!f) return; try { setQr(await fileToCompressedDataUrl(f)); } catch (e) { toast.error((e as Error).message); } };
  const add = async () => {
    if (!qr) { toast.error("请上传收款码"); return; } setBusy(true);
    try { await saveFinance({ accounts: [{ id: uid(), type, note: note.trim(), qr, createdAt: Date.now() }, ...accounts] }, "payout_account.create"); setNote(""); setQr(""); toast.success("收款账号已添加"); }
    catch (e) { toast.error(`添加失败：${(e as Error).message}`); } finally { setBusy(false); }
  };
  const remove = async (id: string) => { try { await saveFinance({ accounts: accounts.filter((a) => a.id !== id) }, "payout_account.delete"); toast.success("已删除"); } catch (e) { toast.error((e as Error).message); } };
  if (variant === "legacy") return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Plus size={16} className="text-primary" />添加收款账号</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">类型</label><PillSelect value={type} onChange={setType} options={Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }))} /></div>
          <div><label htmlFor="pa-note" className="mb-1.5 block text-xs font-medium text-muted-foreground">备注</label><input id="pa-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="姓名/说明 (可选)" className={legacyField} /></div>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">收款码</label>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border text-muted-foreground">{qr ? <img src={qr} alt="收款码" className="h-full w-full object-contain" /> : <CreditCard size={20} />}</div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
              <Button type="button" variant="secondary" className="h-8 gap-1.5 px-3 text-xs" onClick={() => fileRef.current?.click()}><Upload size={14} />{qr ? "重新上传" : "上传收款码"}</Button>
              <p className="mt-1 text-[11px] text-muted-foreground">支付宝/微信/银行卡均可上传收款码或截图 (图片自动压缩)</p>
            </div>
          </div>
        </div>
        <Button className="mt-4 gap-1.5" disabled={busy} onClick={add}><Plus size={15} />添加</Button>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><CreditCard size={16} className="text-primary" />已绑定账号</h2>
        <div className="mt-4">
          {accounts.length === 0 ? legacyEmpty("还没有绑定收款账号", "添加后提现时可直接选择, 无需每次重输") : (
            <ul className="space-y-2">{accounts.map((a) => (
              // eslint-disable-next-line @next/next/no-img-element
              <li key={a.id} className="flex items-center gap-3 rounded-xl border border-border/60 p-3">{a.qr && <img src={a.qr} alt="" className="h-14 w-14 rounded-lg border object-contain" />}<div className="min-w-0 flex-1"><div className="text-sm font-medium">{ACCOUNT_TYPES[a.type] ?? a.type}</div><div className="truncate text-xs text-muted-foreground">{a.note || "—"} · {dateTimeFull(a.createdAt)}</div></div><button onClick={() => remove(a.id)} className="icon-btn h-9 w-9 hover:bg-muted" aria-label="删除"><Trash2 size={16} /></button></li>
            ))}</ul>
          )}
        </div>
      </section>
    </>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="pane space-y-4 p-6">
        <div className="text-base font-semibold">添加收款账号</div>
        <Field label="类型"><PillSelect value={type} onChange={setType} options={Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="备注"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="姓名/说明 (可选)" className={inputCls} /></Field>
        <Field label="收款码">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr ? <div className="flex items-center gap-3"><img src={qr} alt="收款码" className="h-28 w-28 rounded-xl border object-contain" /><button className="chip h-9" onClick={() => setQr("")}>重新上传</button></div> : <button onClick={() => fileRef.current?.click()} className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted"><ImageUp size={20} />上传收款码</button>}
          <p className="mt-2 text-xs text-muted-foreground">支付宝/微信/银行卡均可上传收款码或截图 (图片自动压缩)</p>
        </Field>
        <Button disabled={busy} onClick={add}>添加</Button>
      </section>
      <section className="pane p-6">
        <div className="text-base font-semibold">已绑定账号</div>
        {accounts.length === 0 ? <EmptyBox className="mt-4" title="还没有绑定收款账号" desc="添加后提现时可直接选择, 无需每次重输" /> : (
          <ul className="mt-4 space-y-2">{accounts.map((a) => (
            // eslint-disable-next-line @next/next/no-img-element
            <li key={a.id} className="flex items-center gap-3 rounded-xl border p-3">{a.qr && <img src={a.qr} alt="" className="h-14 w-14 rounded-lg border object-contain" />}<div className="min-w-0 flex-1"><div className="font-medium">{ACCOUNT_TYPES[a.type] ?? a.type}</div><div className="truncate text-sm text-muted-foreground">{a.note || "—"} · {dateTimeFull(a.createdAt)}</div></div><button onClick={() => remove(a.id)} className="icon-btn h-9 w-9 hover:bg-muted" aria-label="删除"><Trash2 size={16} /></button></li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}

export function ProfileTab({ d, variant }: { d?: FinanceData; variant?: "legacy" }) {
  const saveFinance = useSaveFinance(); const [p, setP] = useState<PayoutProfile>({ company: "", bank: "", account: "", taxId: "", invoiceFile: "" }); const [busy, setBusy] = useState(false); const fileRef = useRef<HTMLInputElement>(null); const [fileName, setFileName] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 用已保存资料初始化表单
  useEffect(() => { if (d?.profile) setP(d.profile); }, [d?.profile]);
  const set = (k: keyof PayoutProfile) => (e: React.ChangeEvent<HTMLInputElement>) => setP((s) => ({ ...s, [k]: e.target.value }));
  const pick = async (f?: File) => { if (!f) return; if (!/pdf|jpe?g|png/i.test(f.type)) { toast.error("仅支持 PDF / JPG / PNG"); return; } try { setP((s) => ({ ...s, invoiceFile: "" })); const url = await fileToCompressedDataUrl(f); setP((s) => ({ ...s, invoiceFile: url })); setFileName(f.name); } catch (e) { toast.error((e as Error).message); } };
  const submit = async () => {
    const miss = ([["company", "公司名称"], ["bank", "开户银行"], ["account", "银行账号"], ["taxId", "税号"], ["invoiceFile", "发票文件"]] as const).find(([k]) => !p[k].trim());
    if (miss) { toast.error(`请填写${miss[1]}`); return; } setBusy(true);
    try { await saveFinance({ profile: p }, "payout_profile.update"); toast.success("提现资料已保存"); } catch (e) { toast.error(`保存失败：${(e as Error).message}`); } finally { setBusy(false); }
  };
  if (variant === "legacy") {
    const fields = [["company", "公司名称", "请输入公司全称"], ["bank", "开户银行", "如: 中国工商银行北京海淀分行"], ["account", "银行账号", "请输入对公账号"], ["taxId", "税号", "统一社会信用代码或纳税人识别号"]] as const;
    const ghost = "flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3.5 py-2 text-xs font-medium text-foreground transition-all duration-150 hover:-translate-y-0.5 hover:bg-muted hover:text-primary disabled:opacity-50";
    return (
      <VaultPanel title="提现资料" icon={<Building2 />}>
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/70 p-3"><Info size={14} className="mt-0.5 shrink-0 text-muted-foreground" /><p className="text-xs leading-relaxed text-muted-foreground">内测期 5 字段全必填. 银行账号/税号 PII 末 4 位审计. 发票文件走 R2 加密存储.</p></div>
          <div className="space-y-3">
            {fields.map(([k, l, ph]) => <label key={k} className="block"><span className="text-sm font-medium text-foreground">{l}<span className="text-danger">*</span></span><input value={p[k]} onChange={set(k)} placeholder={ph} className={cn(legacyField, "mt-1.5")} /></label>)}
            <div>
              <span className="text-sm font-medium text-foreground">发票文件<span className="text-danger">*</span></span>
              <div className="mt-1.5 flex items-center gap-2">
                <input ref={fileRef} type="file" accept=".pdf,image/png,image/jpeg" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                <button type="button" onClick={() => fileRef.current?.click()} className={ghost}><Upload size={14} /><span className="ml-1.5">上传发票</span></button>
                <span className="text-xs text-muted-foreground">{p.invoiceFile ? `已上传${fileName ? `：${fileName}` : ""}` : "PDF / JPG / PNG (图片自动压缩)"}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2"><button type="button" disabled={busy} onClick={submit} className={ghost}><Save size={14} /><span className="ml-1.5">保存</span></button></div>
          </div>
        </div>
      </VaultPanel>
    );
  }
  return (
    <section className="pane max-w-3xl space-y-5 p-6">
      <div><div className="text-base font-semibold">提现资料</div><p className="mt-1 text-sm text-muted-foreground">内测期 5 字段全必填. 银行账号/税号 PII 末 4 位审计. 发票文件走 R2 加密存储.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="公司名称" required><input value={p.company} onChange={set("company")} placeholder="公司名称" className={inputCls} /></Field>
        <Field label="开户银行" required><input value={p.bank} onChange={set("bank")} placeholder="开户银行" className={inputCls} /></Field>
        <Field label="银行账号" required><input value={p.account} onChange={set("account")} placeholder="银行账号" className={inputCls} /></Field>
        <Field label="税号" required><input value={p.taxId} onChange={set("taxId")} placeholder="税号" className={inputCls} /></Field>
      </div>
      <Field label="发票文件" required>
        <input ref={fileRef} type="file" accept=".pdf,image/png,image/jpeg" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="flex flex-wrap items-center gap-3"><button onClick={() => fileRef.current?.click()} className="chip h-10 gap-2"><FileUp size={15} />上传发票</button><span className="text-xs text-muted-foreground">{p.invoiceFile ? `已上传${fileName ? `：${fileName}` : ""}` : "PDF / JPG / PNG (图片自动压缩)"}</span></div>
      </Field>
      <Button disabled={busy} onClick={submit}>保存</Button>
    </section>
  );
}
