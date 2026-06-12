'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';
import { forceLogoutRedirect } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { disconnectSocket, getSocket, useSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Lắng nghe các event realtime toàn cục:
 * - `session:revoked` / `force:logout` → clear store, toast, đẩy về /login.
 * - `user:updated` → refetch /auth/me + danh sách users (quyền đổi ngay).
 * Chỉ mount bên trong dashboard layout (đã đăng nhập).
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const clear = useAuthStore((s) => s.clear);
  const hydrate = useAuthStore((s) => s.hydrate);
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === 'authenticated') getSocket();
  }, [status]);

  const forceLogout = (message: string) => {
    clear();
    disconnectSocket();
    toast.warning(message);
    // PHẢI xoá cookie qua /auth/logout trước khi rời trang — router.replace('/login')
    // sẽ bị proxy bounce ngược về /dashboard vì cookie access_token vẫn còn
    void forceLogoutRedirect();
  };

  // Event chỉ bắn vào room `session:{id}` của phiên này → nhận được = phiên này bị thu hồi
  useSocket('session:revoked', () => {
    forceLogout('Phiên đăng nhập đã bị thu hồi từ thiết bị khác');
  });

  useSocket('force:logout', () => {
    forceLogout('Bạn đã bị đăng xuất khỏi mọi thiết bị');
  });

  useSocket('user:updated', () => {
    void hydrate();
    void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
  });

  return children;
}
