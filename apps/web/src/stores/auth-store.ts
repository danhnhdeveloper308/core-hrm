import type { MeResponse, Permission } from '@repo/shared';
import { create } from 'zustand';
import {
  api,
  forceLogoutRedirect,
  resetRefreshCooldown,
  setUnauthorizedHandler,
} from '@/lib/api/client';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: MeResponse | null;
  status: AuthStatus;
  /** Gọi GET /auth/me — hydrate sau khi mount/login/nhận user:updated. */
  hydrate: () => Promise<void>;
  setUser: (user: MeResponse) => void;
  clear: () => void;
  can: (permission: Permission) => boolean;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  status: 'loading',

  hydrate: async () => {
    try {
      const user = await api.get<MeResponse>('/auth/me');
      resetRefreshCooldown();
      set({ user, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'unauthenticated' });
    }
  },

  setUser: (user) => {
    resetRefreshCooldown();
    set({ user, status: 'authenticated' });
  },

  clear: () => set({ user: null, status: 'unauthenticated' }),

  can: (permission) => get().user?.permissions.includes(permission) ?? false,
}));

// 401 không cứu được bằng refresh → clear store, xoá cookie server-side
// (diệt vòng lặp proxy bounce) rồi redirect /login
setUnauthorizedHandler(() => {
  useAuthStore.getState().clear();
  void forceLogoutRedirect();
});
