'use client';

import type { CursorPaginated, Notification } from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { FCM_RESULT_MSG, initFcm, pushPermission, pushSupported } from '@/lib/fcm';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Chỉ hiện nút "bật push" khi FCM đã cấu hình và user CHƯA cấp quyền (client-only).
  // Tính khi mở dropdown (event handler) → tránh setState-trong-effect + SSR mismatch.
  const [showEnablePush, setShowEnablePush] = useState(false);
  const [enabling, setEnabling] = useState(false);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) setShowEnablePush(pushSupported() && pushPermission() === 'default');
  }

  async function enablePush() {
    setEnabling(true);
    const res = await initFcm({ requestPermission: true });
    setEnabling(false);
    toast[res === 'ok' ? 'success' : 'warning'](FCM_RESULT_MSG[res]);
    if (res === 'ok' || res === 'denied') setShowEnablePush(false);
  }

  const { data: unread } = useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000, // fallback; realtime invalidation lo phần lớn
  });

  const { data: list } = useQuery({
    queryKey: queryKeys.notifications.list(false),
    queryFn: () =>
      api.get<CursorPaginated<Notification>>('/notifications?limit=20'),
    enabled: open,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: invalidate,
  });

  const count = unread?.count ?? 0;
  const items = list?.items ?? [];

  function onItemClick(n: Notification) {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Thông báo">
          <Bell className="size-5" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Thông báo</span>
          {count > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck className="size-3.5" /> Đọc tất cả
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Không có thông báo
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onItemClick(n)}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 border-b px-3 py-2.5 text-left transition-colors hover:bg-accent/50 last:border-0',
                  !n.readAt && 'bg-primary/5',
                )}
              >
                <div className="flex w-full items-center gap-2">
                  {!n.readAt && (
                    <span className="size-2 shrink-0 rounded-full bg-primary" />
                  )}
                  <span className="flex-1 truncate text-sm font-medium">
                    {n.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {timeAgo(n.createdAt)}
                  </span>
                </div>
                <span className="line-clamp-2 pl-0 text-xs text-muted-foreground">
                  {n.body}
                </span>
              </button>
            ))
          )}
        </div>
        {showEnablePush && (
          <button
            type="button"
            disabled={enabling}
            onClick={() => void enablePush()}
            className="flex w-full items-center justify-center gap-1.5 border-t px-3 py-2 text-xs font-medium text-primary hover:bg-accent/50 disabled:opacity-50"
          >
            <BellRing className="size-3.5" /> Bật thông báo đẩy trên thiết bị này
          </button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
