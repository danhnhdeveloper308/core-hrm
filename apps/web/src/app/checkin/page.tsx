'use client';

import type { AttendanceLogResponse } from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api/client';

interface TodayResponse {
  logs: AttendanceLogResponse[];
  serverTime: string;
}

const TYPE_LABEL: Record<string, string> = { IN: 'Vào', OUT: 'Ra', UNKNOWN: '—' };

function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CheckinPage() {
  const queryClient = useQueryClient();
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const { data } = useQuery({
    queryKey: ['attendance', 'me', 'today'],
    queryFn: () => api.get<TodayResponse>('/attendance/me/today'),
    refetchInterval: 30_000,
  });

  const lastType = data?.logs[data.logs.length - 1]?.type;
  const nextType: 'IN' | 'OUT' = lastType === 'IN' ? 'OUT' : 'IN';

  const check = useMutation({
    mutationFn: (type: 'IN' | 'OUT') =>
      api.post<AttendanceLogResponse>('/attendance/check', { type }),
    onSuccess: (log) => {
      toast.success(`Đã chấm công ${TYPE_LABEL[log.type]} lúc ${timeStr(log.recordedAt)}`);
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'me', 'today'] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Chấm công thất bại'),
  });

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-4">
      <div className="text-center">
        <Clock className="mx-auto mb-2 size-8 text-muted-foreground" />
        <p className="text-5xl font-bold tabular-nums">{clock}</p>
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString('vi-VN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      <Button
        size="lg"
        className="h-20 w-64 text-lg"
        disabled={check.isPending}
        onClick={() => check.mutate(nextType)}
      >
        {nextType === 'IN' ? (
          <>
            <LogIn className="size-6" /> Chấm công VÀO
          </>
        ) : (
          <>
            <LogOut className="size-6" /> Chấm công RA
          </>
        )}
      </Button>

      <Card className="w-full max-w-sm">
        <CardContent className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Lịch sử hôm nay</h2>
          {!data || data.logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có lượt chấm công</p>
          ) : (
            <ul className="space-y-1">
              {data.logs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium">{TYPE_LABEL[log.type]}</span>
                  <span className="tabular-nums">{timeStr(log.recordedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
