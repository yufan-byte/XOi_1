"use client";
/**
 * 加盟订单（招商合作页「我的订单」）—— 服务端存储。
 *
 * 旧实现走 `useCollection("reseller-orders")`（localStorage）：换设备/换浏览器就没了，
 * 同一台机器登过别人账号还会串单。现在落到 `GET/POST /api/agent/orders`
 * （后端 mc_recruit_orders 表，按 user_id 隔离）。
 *
 * 仍保留一个模块内的轻量订阅：同页多处用这个 hook（新版/旧版/普通用户三种视图）时，
 * 任一处下单后其余视图同步刷新，行为与旧的 `mc:reseller-orders` 事件一致。
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface RecruitOrder {
  id: string;
  pkg: string;
  amount: number;
  method: string;
  note: string;
  subdomain: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

/** 下单入参：id 必给（沿用 uid()），其余字段由后端做长度/白名单收敛 */
export type RecruitOrderInput = Pick<RecruitOrder, "id" | "pkg" | "amount" | "method" | "note" | "subdomain" | "status">;

const EVENT = "xoi:recruit-orders";
const ping = () => { try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* SSR */ } };

async function fetchOrders(): Promise<RecruitOrder[]> {
  const r = await api<{ items: RecruitOrder[] }>("/api/agent/orders");
  return Array.isArray(r?.items) ? r.items : [];
}

export function useRecruitOrders() {
  const [items, setItems] = useState<RecruitOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try { setItems(await fetchOrders()); } catch { /* 未登录/网关不可用时按空处理 */ }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try { const list = await fetchOrders(); if (alive) setItems(list); }
      catch { if (alive) setItems([]); }
      finally { if (alive) setLoading(false); }
    })();
    const onPing = () => { void reload(); };
    window.addEventListener(EVENT, onPing);
    return () => { alive = false; window.removeEventListener(EVENT, onPing); };
  }, [reload]);

  const create = useCallback(async (input: RecruitOrderInput) => {
    const r = await api<{ order: RecruitOrder }>("/api/agent/orders", { method: "POST", body: JSON.stringify(input) });
    ping();
    return r?.order;
  }, []);

  return { items, loading, create, reload };
}
