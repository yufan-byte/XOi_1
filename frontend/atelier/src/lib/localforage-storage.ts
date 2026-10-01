import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";

import { ownerDbName } from "@/xoi/owner";

// app_state 库按宿主登录用户分桶（ownerDbName），模块在 main.tsx 的 initOwner 之后才加载
let appStateInstance: ReturnType<typeof localforage.createInstance> | null = null;
function appStateStore() {
    if (!appStateInstance) {
        appStateInstance = localforage.createInstance({
            name: ownerDbName("state"),
            storeName: "app_state",
        });
    }
    return appStateInstance!;
}

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        try {
            return (await appStateStore().getItem<string>(name)) || null;
        } catch {
            return window.localStorage.getItem(name);
        }
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        try {
            await appStateStore().setItem(name, value);
        } catch {
            window.localStorage.setItem(name, value);
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        try {
            await appStateStore().removeItem(name);
        } catch {
            window.localStorage.removeItem(name);
        }
    },
};
