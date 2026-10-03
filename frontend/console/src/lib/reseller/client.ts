"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, loadAuth } from "@/lib/api";
import { useApp } from "@/store/app";
import type { ResellerData, Section } from "./types";

/** 读取一个分区（公开分区无需登录；其余需管理员） */
export function useResellerSection<K extends Section>(section: K) {
  return useQuery({ queryKey: ["reseller", section], queryFn: () => api<ResellerData[K]>(`/api/reseller/config?section=${section}`), staleTime: 15_000 });
}
export function useResellerAll() {
  return useQuery({ queryKey: ["reseller", "all"], queryFn: () => api<ResellerData>("/api/reseller/config?all=1"), retry: false });
}
export function useSaveSection() {
  const qc = useQueryClient();
  return async <K extends Section>(section: K, value: ResellerData[K], action?: string) => {
    const r = await api<ResellerData[K]>("/api/reseller/config", { method: "PUT", body: JSON.stringify({ section, value, action }) });
    qc.invalidateQueries({ queryKey: ["reseller"] }); return r;
  };
}
/** 代理商中心身份：platform = 站长 / 管理员（看全站）；agent = 站长批准的代理（只看自己的客户）；null = 不能进入 */
export interface ResellerMe { scope: "platform" | "agent" | null; root?: boolean; status?: "approved" | "frozen"; inviteCode?: string | null; /** 站长分配的专属域名 */ domain?: string | null; markupPct?: number }
export function useResellerMe() {
  const u = useApp((s) => s.user);
  return useQuery({ queryKey: ["reseller", "me", u?.id ?? 0], queryFn: () => api<ResellerMe>("/api/reseller/me"), enabled: !!u || !!loadAuth(), staleTime: 60_000, retry: 1 });
}
export function useResellerScope() { return useResellerMe().data?.scope ?? null; }
export function useIsReseller() { return !!useResellerScope(); }
