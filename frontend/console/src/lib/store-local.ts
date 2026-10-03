"use client";
// 各工作台的项目数据：本地持久化（没有业务后端时的落地方案），按用户名隔离
import { loadAuth } from "@/lib/api";
export function collection<T extends { id: string; updatedAt?: number }>(name: string) {
  const key = () => `mc.${name}.${loadAuth()?.user.username ?? "anon"}`;
  const read = (): T[] => { try { return JSON.parse(localStorage.getItem(key()) ?? "[]"); } catch { return []; } };
  const write = (items: T[]) => { try { localStorage.setItem(key(), JSON.stringify(items)); } catch { /* quota */ } window.dispatchEvent(new CustomEvent(`mc:${name}`)); };
  return {
    list: read,
    get: (id: string) => read().find((x) => x.id === id),
    upsert: (item: T) => { const items = read(); const i = items.findIndex((x) => x.id === item.id); const next = { ...item, updatedAt: Date.now() }; if (i >= 0) items[i] = next; else items.unshift(next); write(items); return next; },
    remove: (id: string) => write(read().filter((x) => x.id !== id)),
    subscribe: (fn: () => void) => { window.addEventListener(`mc:${name}`, fn); return () => window.removeEventListener(`mc:${name}`, fn); },
  };
}
import { useEffect, useState } from "react";
export function useCollection<T extends { id: string; updatedAt?: number }>(name: string) {
  const col = collection<T>(name);
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => { setItems(col.list()); return col.subscribe(() => setItems(col.list())); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  return { items, ...col };
}
