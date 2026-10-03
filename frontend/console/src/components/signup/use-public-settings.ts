"use client";
import { useQuery } from "@tanstack/react-query";
import type { SettingsConfig } from "@/lib/reseller/types";

export type PublicSettings = Pick<SettingsConfig, "minTopup" | "allowCustomAmount" | "topupTiers" | "userInvite" | "inviteRate" | "inviteReward" | "showInviteCodeOnSignup" | "topupGuide" | "topupGuideText" | "topupGuideButton" | "topupGuideUrl" | "showBecomeReseller" | "becomeResellerPopup">;

/** 站点公开设置（充值档次 / 邀请开关）：用普通 fetch，未登录也能读（useResellerSection 走 api()，未登录时会直接抛「未登录」） */
export function usePublicSettings() {
  return useQuery({
    queryKey: ["reseller", "settings", "public"],
    queryFn: async () => {
      const r = await fetch("/api/reseller/config?section=settings", { cache: "no-store" });
      const j = (await r.json()) as { success: boolean; data?: PublicSettings };
      if (!j.success || !j.data) throw new Error("settings unavailable");
      return j.data;
    },
    staleTime: 15_000, retry: 1,
  });
}
