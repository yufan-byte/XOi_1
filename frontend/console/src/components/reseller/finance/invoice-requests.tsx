"use client";
// 代理商后台 → 发票记录：开票申请的服务端存储尚未上线。
// 旧实现只扫本机 localStorage 的 mc.invoices.*——客户的申请写在客户自己的浏览器里，
// 站长这边永远是空的（一个假的「暂无申请」），而同机登过客户账号时又会把对方的抬头、
// 税号、邮箱和发票文件列出来。宁可如实占位，也不给一个会误导人的面板。见 git 历史。
import { Receipt } from "lucide-react";
import { VaultPanel } from "@/components/reseller/common";

export function InvoiceRequestsPanel() {
  // 这个面板只扫本机 localStorage 的 mc.invoices.*，客户的申请写在客户自己的浏览器里，
  // 永远不会出现在这儿——站长看到的「暂无开票申请」是假的；而同一台浏览器登过客户账号时，
  // 又会把对方的抬头、税号、邮箱和发票文件列出来。服务端接口做好之前，先如实说明。
  return (
    <VaultPanel title="开票申请" icon={<Receipt />}>
      <p className="py-10 text-center text-[13px] leading-6 text-muted-foreground">
        开票申请的服务端存储还没上线，这里暂时看不到客户提交的申请。<br />
        请先通过客服渠道收集开票信息，上线后会自动汇总到这里。
      </p>
    </VaultPanel>
  );
}
