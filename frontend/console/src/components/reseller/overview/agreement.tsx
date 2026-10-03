"use client";
import { useEffect, useRef } from "react";
import { BadgeCheck, Globe2, Users } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api } from "@/lib/api";

const SECTIONS = [
  { icon: Globe2, title: "品牌与域名", text: "代理后台用于管理白标站点、客户、收益和提现。对外品牌、域名与客服承诺需要和站点实际能力保持一致，不得夸大宣传或冒用官方身份。" },
  { icon: BadgeCheck, title: "收益与提现", text: "收益以平台记录的充值、消费、返佣与发票状态为准。提现前需确认账单、发票和结算状态，避免重复申请与差票异常。" },
  { icon: Users, title: "客户运营", text: "代理商可配置客服、交流群、卡密和客户入口，但需确保联系方式真实有效，并对下游推广内容和合规性负责。" },
];
const SIGNED_KEY = "mc.reseller.agreement.signed";

/** 代理协议：首次打开时记录审计 agreement.signed */
export function AgreementDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const sent = useRef(false);
  useEffect(() => {
    if (!open || sent.current) return;
    let signed = false; try { signed = localStorage.getItem(SIGNED_KEY) === "1"; } catch {}
    sent.current = true; if (signed) return;
    api("/api/reseller/audit", { method: "POST", body: JSON.stringify({ action: "agreement.signed", targetType: "agreement" }) }).then(() => { try { localStorage.setItem(SIGNED_KEY, "1"); } catch {} }).catch(() => { sent.current = false; });
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="代理协议" description="查看品牌、收益结算与客户运营相关的代理协议要点。">
        <div className="space-y-3">
          {SECTIONS.map(({ icon: I, title, text }) => (
            <div key={title} className="rounded-2xl border p-4"><div className="flex items-center gap-2 font-semibold"><I size={16} className="text-primary" />{title}</div><p className="mt-2 text-sm leading-7 text-muted-foreground">{text}</p></div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
