import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";
import { ownerDbName } from "@/xoi/owner";

// XOi 宿主按用户分桶，画布与外层资产中心才能看到同一批素材。
// 旧的 infinite-canvas 库仍由资产 store 做一次性迁移兜底。
const appStateStore = localforage.createInstance({ name: ownerDbName("state"), storeName: "app_state" });
const legacyAppStateStore = localforage.createInstance({ name: "infinite-canvas", storeName: "app_state" });

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        try {
            const current = await appStateStore.getItem<string>(name);
            if (current) return current;
            // 同一份迁移兜底覆盖画布项目、配置、提示词等旧版状态键。
            const legacy = await legacyAppStateStore.getItem<string>(name);
            if (legacy) {
                await appStateStore.setItem(name, legacy);
                return legacy;
            }
            return null;
        } catch {
            return window.localStorage.getItem(name);
        }
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        try {
            await appStateStore.setItem(name, value);
        } catch {
            window.localStorage.setItem(name, value);
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        try {
            await appStateStore.removeItem(name);
        } catch {
            window.localStorage.removeItem(name);
        }
    },
};
