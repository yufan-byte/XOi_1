import { create } from "zustand";

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
};

type UserStore = {
    token: string;
    user: LocalUser | null;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    token: "",
    user: null,
    clearSession: () => set({ user: null }),
}));
