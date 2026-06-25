'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';
import { forceLogoutRedirect } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import {
  initFcm,
  maybePromptForPush,
  pushPermission,
  pushSupported,
  showNativeIfHidden,
} from '@/lib/fcm';
import { disconnectSocket, getSocket, useSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';

/** targetType phiếu duyệt → prefix query key domain cần invalidate. */
const APPROVAL_DOMAIN_KEYS: Record<string, string[]> = {
  LEAVE: ['leave'],
  ATTENDANCE_CORRECTION: ['attendance'],
  OT: ['attendance'],
  SHIFT_BATCH: ['shift-registrations'],
};

/**
 * Lắng nghe các event realtime toàn cục:
 * - `session:revoked` / `force:logout` → clear store, toast, đẩy về /login.
 * - `user:updated` → refetch /auth/me + danh sách users (quyền đổi ngay).
 * - `notification:new` → toast + cập nhật chuông.
 * - `approval:changed` → invalidate dữ liệu đơn (2 chiều requester/approver).
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

  // Thông báo trình duyệt sau khi đăng nhập (không phụ thuộc cấu hình Firebase):
  // - Đã cấp quyền → init (đăng ký FCM nếu có cấu hình), im lặng.
  // - Chưa cấp quyền → hiện prompt 1 lần (không nag, nhớ "để sau" 7 ngày).
  useEffect(() => {
    if (status !== 'authenticated' || !pushSupported()) return;
    if (pushPermission() === 'granted') void initFcm();
    else maybePromptForPush();
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

  useSocket('notification:new', (n) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    toast(n.title, { description: n.body });
    // Đang ở tab khác → bắn thông báo OS để user thấy ngay (không cần Firebase).
    showNativeIfHidden({ title: n.title, body: n.body, link: n.link });
  });

  // Phiếu duyệt đổi trạng thái → invalidate dữ liệu domain cho CẢ requester lẫn
  // approver (status đơn cập nhật realtime, không cần reload trang).
  useSocket('approval:changed', (e) => {
    void queryClient.invalidateQueries({ queryKey: ['approval'] });
    const domain = APPROVAL_DOMAIN_KEYS[e.targetType];
    if (domain) void queryClient.invalidateQueries({ queryKey: domain });
  });

  return children;
}
