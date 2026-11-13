import { create } from 'zustand';

export interface AuthUserSummary {
  id: string;
  phone: string | null;
  name: string | null;
  email?: string | null;
  preferredLanguage?: 'tr' | 'en' | 'ar';
  referralCode: string;
}

interface AuthStoreState {
  isAuthenticated: boolean;
  user: AuthUserSummary | null;
  setAuthenticated: (user: AuthUserSummary | null) => void;
  updateUser: (patch: Partial<AuthUserSummary>) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  isAuthenticated: false,
  user: null,
  setAuthenticated: (user) => set({ isAuthenticated: true, user }),
  updateUser: (patch) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...patch } : null,
    })),
  clearAuth: () => set({ isAuthenticated: false, user: null }),
}));

