import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";
import { ownerDbName, ownerKey } from "@/xoi/owner";

// 只读取已验证用户的分桶。公共旧库归属不明，不能自动复制给当前账号。
const appStateStore = localforage.createInstance({ name: ownerDbName("state"), storeName: "app_state" });

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        try {
            return (await appStateStore.getItem<string>(name)) || null;
        } catch {
            return window.localStorage.getItem(ownerKey(name));
        }
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        try {
            await appStateStore.setItem(name, value);
        } catch {
            window.localStorage.setItem(ownerKey(name), value);
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        try {
            await appStateStore.removeItem(name);
        } catch {
            window.localStorage.removeItem(ownerKey(name));
        }
    },
};
