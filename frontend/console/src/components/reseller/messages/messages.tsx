"use client";
import { Inbox, MessageCircle, Send } from "lucide-react";
import { SectionHero, VaultPanel } from "@/components/reseller/common";
import { EmptyPanel } from "@/components/reseller/legacy/frame";

/**
 * 我的留言：平台管理员私信。
 *
 * ⚠️ 这里**故意不做假的统计条**（造物原版是「全部 0 / 未读 0」两个恒为 0 的计数器 + 空表，
 * 看起来像坏了）。本站就是平台本体，留言走客服与反馈渠道，因此改成明确的沟通入口说明。
 */
export function MessagesView() {
  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="消息" icon={<Inbox />} title="我的留言" subtitle="与平台运营的沟通记录" />
      <div className="flex flex-1 flex-col gap-3 pb-24">
        <VaultPanel title="还没有独立的消息中心">
          <EmptyPanel
            icon={<MessageCircle />}
            title="当前沟通走客服与反馈渠道"
            desc="留言中心的服务端存储尚未上线。有合作、结算或账号问题，请通过「客户服务」里的客服微信 / 交流群联系，或在主站「问题反馈」提交，都会有人跟进。"
          />
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5"><Send size={12} />主站「问题反馈」表单</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5"><MessageCircle size={12} />客户服务 → 客服微信 / 交流群</span>
          </div>
        </VaultPanel>
      </div>
    </div>
  );
}
