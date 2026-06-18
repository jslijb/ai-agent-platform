import { create } from "zustand";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  wechatNickname: string | null;
  wechatAvatarUrl: string | null;
}

interface AuthState {
  isLoggedIn: boolean;
  user: UserInfo | null;
  token: string | null;
  setAuth: (token: string, user: UserInfo) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: false,
  user: null,
  token: null,
  setAuth: (token, user) => set({ isLoggedIn: true, user, token }),
  clearAuth: () => set({ isLoggedIn: false, user: null, token: null }),
}));
