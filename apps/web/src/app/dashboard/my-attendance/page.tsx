'use client';

import type {
  AttendanceLogResponse,
  TimesheetDayResponse,
  TimesheetStatus,
} from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FadeIn } from '@/components/motion/primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api/client';

interface MyAttendance {
  logs: AttendanceLogResponse[];
  timesheet: TimesheetDayResponse[];
}

const STATUS_META: Record<
  TimesheetStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  PRESENT: { label: 'Đủ công', variant: 'default' },
  LATE: { label: 'Đi trễ', variant: 'secondary' },
  EARLY_LEAVE: { label: 'Về sớm', variant: 'secondary' },
  LATE_AND_EARLY: { label: 'Trễ + sớm', variant: 'secondary' },
  ABSENT: { label: 'Vắng', variant: 'destructive' },
  ON_LEAVE: { label: 'Nghỉ phép', variant: 'outline' },
  HALF_LEAVE: { label: 'Nghỉ nửa ngày', variant: 'outline' },
  HOLIDAY: { label: 'Nghỉ lễ', variant: 'outline' },
  WEEKEND: { label: 'Cuối tuần', variant: 'outline' },
  NOT_SCHEDULED: { label: 'Chưa xếp ca', variant: 'outline' },
};

function timeStr(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MyAttendancePage() {
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  );
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'me', { from, to }],
    queryFn: () => api.get<MyAttendance>(`/attendance/me?from=${from}&to=${to}`),
  });

  const logsByDate = useMemo(() => {
    const map = new Map<string, AttendanceLogResponse[]>();
    for (const log of data?.logs ?? []) {
      const date = log.recordedAt.slice(0, 10);
      const arr = map.get(date) ?? [];
      arr.push(log);
      map.set(date, arr);
    }
    return map;
  }, [data?.logs]);

  const summary = useMemo(() => {
    const ts = data?.timesheet ?? [];
    return {
      present: ts.filter((d) =>
        ['PRESENT', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY'].includes(d.status),
      ).length,
      late: ts.filter((d) => d.lateMinutes > 0).length,
      absent: ts.filter((d) => d.status === 'ABSENT').length,
      leave: ts.filter((d) => ['ON_LEAVE', 'HALF_LEAVE'].includes(d.status)).length,
    };
  }, [data?.timesheet]);

  return (
    <FadeIn className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Chấm công của tôi</h1>
        <p className="text-muted-foreground">Lịch sử chấm công và bảng công cá nhân</p>
      </div>

      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Tháng</Label>
          <Input
            type="month"
            className="w-40"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Ngày công', value: summary.present, cls: 'text-green-600' },
          { label: 'Lượt đi trễ', value: summary.late, cls: 'text-amber-600' },
          { label: 'Ngày vắng', value: summary.absent, cls: 'text-destructive' },
          { label: 'Ngày nghỉ phép', value: summary.leave, cls: 'text-blue-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Giờ vào</TableHead>
              <TableHead>Giờ ra</TableHead>
              <TableHead>Trễ / Sớm</TableHead>
              <TableHead>Số lượt chấm</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-40 w-full" />
                </TableCell>
              </TableRow>
            ) : (data?.timesheet ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Chưa có dữ liệu chấm công trong tháng này
                </TableCell>
              </TableRow>
            ) : (
              (data?.timesheet ?? []).map((day) => {
                const meta = STATUS_META[day.status];
                const dayLogs = logsByDate.get(day.date) ?? [];
                const weekday = new Date(`${day.date}T00:00:00Z`).toLocaleDateString(
                  'vi-VN',
                  { weekday: 'short' },
                );
                return (
                  <TableRow key={day.id || day.date}>
                    <TableCell className="font-medium">
                      {day.date.slice(8)}/{day.date.slice(5, 7)}{' '}
                      <span className="text-xs text-muted-foreground">{weekday}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{timeStr(day.firstIn)}</TableCell>
                    <TableCell className="tabular-nums">{timeStr(day.lastOut)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {day.lateMinutes > 0 ? `trễ ${day.lateMinutes}p` : ''}
                      {day.lateMinutes > 0 && day.earlyMinutes > 0 ? ' · ' : ''}
                      {day.earlyMinutes > 0 ? `sớm ${day.earlyMinutes}p` : ''}
                      {day.lateMinutes === 0 && day.earlyMinutes === 0 ? '—' : ''}
                    </TableCell>
                    <TableCell>{dayLogs.length}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </FadeIn>
  );
}
