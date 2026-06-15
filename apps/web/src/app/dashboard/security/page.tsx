'use client';

import type { SessionResponse } from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, LogOut, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { formatDateTime, timeAgo } from '@/lib/format';

function DeviceIcon({ deviceName }: { deviceName: string | null }) {
  const mobile = /android|ios/i.test(deviceName ?? '');
  return mobile ? (
    <Smartphone className="size-5 text-muted-foreground" />
  ) : (
    <Laptop className="size-5 text-muted-foreground" />
  );
}

export default function SecurityPage() {
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: queryKeys.sessions.mine,
    queryFn: () => api.get<SessionResponse[]>('/sessions/me'),
    refetchOnWindowFocus: true,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.mine });

  const revokeOne = useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/sessions/${id}`),
    onSuccess: (res) => {
      toast.success(res.message);
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Thu hồi thất bại'),
  });

  const revokeOthers = useMutation({
    mutationFn: () =>
      api.post<{ message: string }>('/sessions/revoke-others'),
    onSuccess: (res) => {
      toast.success(res.message);
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Thu hồi thất bại'),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bảo mật</h1>
          <p className="text-muted-foreground">
            Phiên đăng nhập và thiết bị đang hoạt động
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={revokeOthers.isPending}>
              <LogOut className="size-4" /> Thu hồi tất cả phiên khác
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Thu hồi mọi phiên khác?</AlertDialogTitle>
              <AlertDialogDescription>
                Tất cả thiết bị khác sẽ bị đăng xuất ngay lập tức (realtime).
                Phiên hiện tại được giữ nguyên.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Huỷ</AlertDialogCancel>
              <AlertDialogAction onClick={() => revokeOthers.mutate()}>
                Thu hồi
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sessions?.map((session) => (
            <Card key={session.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DeviceIcon deviceName={session.deviceName} />
                    {session.deviceName ?? 'Thiết bị không xác định'}
                    {session.isCurrent ? <Badge>Thiết bị này</Badge> : null}
                  </CardTitle>
                  {!session.isCurrent && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={revokeOne.isPending}
                        >
                          Thu hồi
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Thu hồi phiên này?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Thiết bị {session.deviceName ?? 'này'} sẽ bị đăng xuất
                            ngay lập tức.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Huỷ</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => revokeOne.mutate(session.id)}
                          >
                            Thu hồi
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
                <CardDescription>
                  IP {session.ip ?? '—'} · Hoạt động {timeAgo(session.lastActiveAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Đăng nhập lúc {formatDateTime(session.createdAt)} · Hết hạn{' '}
                {formatDateTime(session.expiresAt)}
              </CardContent>
            </Card>
          ))}
          {sessions?.length === 0 ? (
            <p className="text-muted-foreground">Không có phiên nào.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
