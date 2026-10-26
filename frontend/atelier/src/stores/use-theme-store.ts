import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ownerKey } from "@/xoi/owner";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "light",
            setTheme: (theme) => set({ theme }),
        }),
        { name: ownerKey("xoi-canvas:appearance:v2") },
    ),
);
