"use client";
// 发票管理：申请发票 / 状态（申请记录保存在本地集合 invoices，按用户隔离），外观与参考站一致
// 开票后的文件由代理商后台（/reseller/finance/invoices）挂回同一条记录的 file 字段，状态页可直接下载
import { useState } from "react";
import { Download, FileText, Pencil, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSelf } from "@/lib/queries";
import { useCollection } from "@/lib/store-local";
import { cn, quotaToUsd, uid, USD_TO_CNY } from "@/lib/utils";
import { AccountDialog, AccountTabs } from "./account-dialog-shell";

/** 已开出的发票文件：name 为下载时的文件名，url 为 dataURL 或可直接下载的链接 */
export interface InvoiceFile { name: string; url: string; type?: string; size?: number; uploadedAt?: number }
export interface Invoice { id: string; type: "personal" | "company"; amount: number; company: string; taxId: string; email: string; notes: string; status: "draft" | "pending" | "issued"; createdAt: number; updatedAt?: number; file?: InvoiceFile }
type Form = Omit<Invoice, "id" | "status" | "createdAt" | "updatedAt" | "amount"> & { amount: string };
const EMPTY: Form = { type: "personal", amount: "", company: "", taxId: "", email: "", notes: "" };
const STATUS: Record<Invoice["status"], [string, string]> = { draft: ["草稿", "bg-muted text-muted-foreground"], pending: ["待处理", "bg-warning/15 text-warning"], issued: ["已开票", "bg-success/10 text-success"] };
const TABS = [["apply", "申请发票"], ["status", "状态"]] as const;
const TYPES = [["personal", "个人"], ["company", "企业"]] as const;
const inputCls = "h-[41px] w-full rounded-[10px] border border-border bg-foreground/[0.03] px-[11px] py-[9px] text-[13px] font-medium leading-[20.8px] outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/30";
const pillBtn = "inline-flex h-[36px] items-center gap-[7px] rounded-full border px-[18px] py-[9px] text-[13px] font-semibold leading-[16.25px] transition-[background,filter]";
const fmtMoney = (cny: number) => `¥${cny.toFixed(2)}`;
const fmtTime = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function Field({ id, label, required, children, hint }: { id?: string; label: string; required?: boolean; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-[13px] flex flex-col gap-[6px]">
      <label htmlFor={id} className="flex gap-[5px] text-[11.5px] font-[560] leading-[18.4px] text-muted-foreground">{label}{required && <span className="text-primary">*</span>}</label>
      {children}
      {hint && <span className="text-[11px] font-medium leading-[17.6px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** 用户菜单 → 发票申请 */
export function InvoiceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: self, isLoading } = useSelf(open); const col = useCollection<Invoice>("invoices");
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("apply"); const [form, setForm] = useState<Form>(EMPTY); const [editing, setEditing] = useState<string | null>(null);
  const balance = self ? quotaToUsd(self.quota) * USD_TO_CNY : null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const validate = (strict: boolean) => {
    const amount = Number(form.amount);
    if (strict || form.amount) { if (!(amount > 0)) { toast.error("请输入有效的发票金额"); return null; } if (balance != null && amount > balance) { toast.error(`金额超过可用余额（${fmtMoney(balance)}）`); return null; } }
    if (strict) {
      if (form.type === "company" && !form.company.trim()) { toast.error("请填写公司/抬头名称"); return null; }
      if (form.type === "company" && !/^[0-9A-Z]{18}$/.test(form.taxId.trim())) { toast.error("请输入 18 位统一社会信用代码"); return null; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { toast.error("请输入有效的接收邮箱"); return null; }
    }
    return amount;
  };
  const persist = (status: Invoice["status"]) => {
    const amount = validate(status !== "draft"); if (amount == null) return;
    const prev = editing ? col.get(editing) : undefined;
    col.upsert({ id: prev?.id ?? uid(), createdAt: prev?.createdAt ?? Date.now(), file: prev?.file, type: form.type, amount, company: form.company.trim(), taxId: form.taxId.trim(), email: form.email.trim(), notes: form.notes.trim(), status });
    toast.success(status === "draft" ? "草稿已保存" : "发票申请已成功提交！"); setForm(EMPTY); setEditing(null); setTab("status");
  };
  const loadDraft = (i: Invoice) => { setForm({ type: i.type, amount: i.amount ? String(i.amount) : "", company: i.company, taxId: i.taxId, email: i.email, notes: i.notes }); setEditing(i.id); setTab("apply"); };
  return (
    <AccountDialog open={open} onOpenChange={onOpenChange} title="发票管理" description="申请和管理你的发票" className="w-[min(calc(100%-32px),460px)]">
      <AccountTabs value={tab} options={TABS} onChange={setTab} inline />
      {tab === "apply" ? (
        <div className="pt-[17.6px]">
          {editing && <div className="mb-[13px] flex items-center justify-between rounded-[10px] bg-primary/10 px-[11px] py-[8px] text-[11.5px] text-primary"><span>正在编辑草稿</span><button type="button" className="underline" onClick={() => { setForm(EMPTY); setEditing(null); }}>放弃</button></div>}
          <Field label="发票类型"><AccountTabs value={form.type} options={TYPES} onChange={(v) => set("type", v)} inline wrap={false} className="w-fit" /></Field>
          <Field id="inv-amount" label="金额" required hint={isLoading ? "正在加载可用余额" : balance == null ? "暂无法获取可用余额" : `可用余额：${fmtMoney(balance)}`}><input id="inv-amount" type="number" min={0} step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="¥0.00" className={cn(inputCls, "h-[44px] text-[15px] font-[620] leading-[24px]")} /></Field>
          <Field id="inv-company" label="公司/抬头名称"><input id="inv-company" type="text" value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="如：北京示例科技有限公司" className={inputCls} /></Field>
          <Field id="inv-tax" label="税号"><input id="inv-tax" type="text" value={form.taxId} onChange={(e) => set("taxId", e.target.value.toUpperCase())} maxLength={18} placeholder="请输入 18 位统一社会信用代码" className={inputCls} /></Field>
          <Field id="inv-email" label="接收邮箱" required><input id="inv-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="如：finance@example.com" className={inputCls} /></Field>
          <Field id="inv-notes" label="备注"><input id="inv-notes" type="text" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="可填发票备注，如订单号、项目名等" className={inputCls} /></Field>
          <div className="mt-[4px] flex flex-wrap justify-end gap-[9px] border-t border-foreground/[0.06] pt-[15px]">
            <button type="button" onClick={() => setTab("status")} className={cn(pillBtn, "border-border text-muted-foreground hover:bg-muted")}>状态</button>
            <button type="button" onClick={() => persist("draft")} className={cn(pillBtn, "border-border text-muted-foreground hover:bg-muted")}>保存草稿</button>
            <button type="button" onClick={() => persist("pending")} className={cn(pillBtn, "border-primary/55 bg-primary/88 text-white hover:brightness-110")}>提交申请</button>
          </div>
        </div>
      ) : (
        <div className="pt-[6.6px]">
          {col.items.length === 0 && <div className="pb-[40px] pt-[34px] text-center text-[13px] font-medium leading-[20.8px] text-muted-foreground"><Receipt className="mx-auto mb-[8.8px] h-[22px] w-[22px]" />暂无发票申请</div>}
          {col.items.length > 0 && <div className="mt-[11px] divide-y divide-border/60 rounded-[10px] border border-border/60">
            {col.items.map((i) => { const [label, cls] = STATUS[i.status]; return (
              <div key={i.id} className="flex flex-wrap items-center gap-[11px] px-[13px] py-[11px]">
                <span className="grid h-[36px] w-[36px] shrink-0 place-items-center rounded-[10px] bg-primary/10 text-primary"><FileText className="h-[16px] w-[16px]" /></span>
                <div className="min-w-0 flex-1"><div className="flex items-center gap-[8px] text-[13px] font-semibold"><span className="truncate">{i.company || (i.type === "company" ? "企业发票" : "个人发票")}</span><span className={cn("rounded-full px-[8px] py-px text-[10.5px]", cls)}>{label}</span></div><div className="mt-[2px] text-[11px] text-muted-foreground">{i.type === "company" ? "企业" : "个人"} · {fmtMoney(i.amount)} · {i.email || "未填邮箱"} · {fmtTime(i.createdAt)}</div></div>
                <div className="flex gap-[4px]">
                  {i.file && <a href={i.file.url} download={i.file.name} target="_blank" rel="noopener noreferrer" className="inline-flex h-[28px] items-center gap-[4px] rounded-full border border-primary/55 bg-primary/88 px-[10px] text-[11px] font-semibold text-white hover:brightness-110"><Download className="h-[12px] w-[12px]" />下载发票</a>}
                  {i.status === "draft" && <button type="button" className="inline-flex h-[28px] items-center gap-[4px] rounded-full border border-border px-[10px] text-[11px] hover:bg-muted" onClick={() => loadDraft(i)}><Pencil className="h-[12px] w-[12px]" />编辑</button>}
                  {i.status !== "issued" && <button type="button" className="inline-flex h-[28px] items-center gap-[4px] rounded-full border border-border px-[10px] text-[11px] text-danger hover:bg-muted" onClick={() => { col.remove(i.id); toast.success(i.status === "draft" ? "草稿已删除" : "申请已撤销"); }}><Trash2 className="h-[12px] w-[12px]" />{i.status === "draft" ? "删除" : "撤销"}</button>}
                </div>
              </div>
            ); })}
          </div>}
        </div>
      )}
    </AccountDialog>
  );
}
