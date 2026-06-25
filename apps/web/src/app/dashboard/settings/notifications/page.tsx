'use client';

import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type NotificationPrefs,
  type NotificationType,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FadeIn } from '@/components/motion/primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

const TYPES: { key: NotificationType; label: string; desc: string }[] = [
  {
    key: 'APPROVAL_PENDING',
    label: 'Đơn cần tôi duyệt',
    desc: 'Khi có đơn chờ bạn phê duyệt (gồm cả nhắc quá hạn)',
  },
  {
    key: 'APPROVAL_DECIDED',
    label: 'Kết quả đơn của tôi',
    desc: 'Khi đơn bạn gửi được duyệt hoặc bị từ chối',
  },
  {
    key: 'GENERAL',
    label: 'Thông báo chung',
    desc: 'Đơn bị huỷ, escalation và các thông báo khác',
  },
];

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  inApp: 'Chuông (in-app)',
  email: 'Email',
  push: 'Trình duyệt (push)',
};

export default function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const { data: prefs, isLoading } = useQuery({
    queryKey: queryKeys.notifications.preferences,
    queryFn: () => api.get<NotificationPrefs>('/notifications/preferences'),
  });

  const mutation = useMutation({
    mutationFn: (next: NotificationPrefs) =>
      api.put<NotificationPrefs>('/notifications/preferences', next),
    // Optimistic: cập nhật UI ngay, rollback nếu lỗi
    onMutate: (next) => {
      const prev = queryClient.getQueryData<NotificationPrefs>(
        queryKeys.notifications.preferences,
      );
      queryClient.setQueryData(queryKeys.notifications.preferences, next);
      return { prev };
    },
    onError: (e, _next, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKeys.notifications.preferences, ctx.prev);
      }
      toast.error(e instanceof ApiError ? e.message : 'Lưu tuỳ chọn thất bại');
    },
  });

  function toggle(type: NotificationType, channel: NotificationChannel, value: boolean) {
    if (!prefs) return;
    mutation.mutate({
      ...prefs,
      [type]: { ...prefs[type], [channel]: value },
    });
  }

  return (
    <FadeIn className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Cài đặt thông báo</h1>
        <p className="text-muted-foreground">
          Chọn kênh nhận cho từng loại thông báo. Thay đổi được lưu ngay.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kênh nhận theo loại</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !prefs ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 text-left font-medium">Loại thông báo</th>
                    {NOTIFICATION_CHANNELS.map((c) => (
                      <th key={c} className="px-3 py-2 text-center font-medium">
                        {CHANNEL_LABELS[c]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TYPES.map((t) => (
                    <tr key={t.key} className="border-b last:border-0">
                      <td className="py-3 pr-3">
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.desc}</div>
                      </td>
                      {NOTIFICATION_CHANNELS.map((c) => (
                        <td key={c} className="px-3 py-3 text-center">
                          <Switch
                            checked={prefs[t.key][c]}
                            disabled={mutation.isPending}
                            onCheckedChange={(v) => toggle(t.key, c, v)}
                            aria-label={`${t.label} · ${CHANNEL_LABELS[c]}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Kênh <b>Trình duyệt (push)</b> cần bạn cấp quyền thông báo cho trình duyệt
        (bấm chuông → “Bật thông báo”). Kênh <b>Email</b> gửi tới email tài khoản
        (nếu có).
      </p>
    </FadeIn>
  );
}
