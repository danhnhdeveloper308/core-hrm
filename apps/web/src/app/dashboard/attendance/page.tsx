'use client';

import {
  PERMISSIONS,
  type OrgUnitResponse,
  type TimesheetDayResponse,
  type TimesheetGridRow,
  type TimesheetStatus,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Pencil,
  RotateCcw,
  Trash2,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CountUp, FadeIn } from '@/components/motion/primitives';
import { PermissionGate } from '@/components/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { cn } from '@/lib/utils';

const ALL = '__all__';
const WEEKDAY_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Mã ngắn + class màu (nền + chữ) cho từng trạng thái — tông hiện đại, dark-mode ok. */
const STATUS_META: Record<
  TimesheetStatus,
  { label: string; cell: string; dot: string; full: string }
> = {
  PRESENT: { label: 'P', cell: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', full: 'Đủ công' },
  LATE: { label: 'L', cell: 'bg-amber-500/20 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', full: 'Đi trễ' },
  EARLY_LEAVE: { label: 'S', cell: 'bg-orange-500/15 text-orange-600 dark:text-orange-400', dot: 'bg-orange-500', full: 'Về sớm' },
  LATE_AND_EARLY: { label: 'LS', cell: 'bg-orange-500/25 text-orange-700 dark:text-orange-300', dot: 'bg-orange-600', full: 'Trễ + về sớm' },
  ABSENT: { label: 'V', cell: 'bg-red-500/15 text-red-600 dark:text-red-400', dot: 'bg-red-500', full: 'Vắng' },
  ON_LEAVE: { label: 'N', cell: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500', full: 'Nghỉ phép' },
  HALF_LEAVE: { label: 'N½', cell: 'bg-blue-500/10 text-blue-500 dark:text-blue-300', dot: 'bg-blue-400', full: 'Nghỉ nửa ngày' },
  HOLIDAY: { label: 'Lễ', cell: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', dot: 'bg-violet-500', full: 'Nghỉ lễ' },
  WEEKEND: { label: '', cell: 'bg-muted/40 text-muted-foreground', dot: 'bg-slate-400', full: 'Cuối tuần' },
  NOT_SCHEDULED: { label: '·', cell: 'text-muted-foreground/40', dot: 'bg-slate-300', full: 'Chưa xếp ca' },
};

const PRESENT_SET = ['PRESENT', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY'];

function monthDays(year: number, month: number): string[] {
  const days: string[] = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

function timeStr(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** ISO → "HH:mm" (giờ trình duyệt) để prefill input time. */
function toHHmm(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AttendancePage() {
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  );
  const [orgUnitId, setOrgUnitId] = useState(ALL);
  const [detail, setDetail] = useState<{
    employeeId: string;
    name: string;
    date: string;
    day: TimesheetDayResponse;
  } | null>(null);
  const [editForm, setEditForm] = useState<{
    firstIn: string;
    lastOut: string;
    note: string;
  } | null>(null);

  const [year, monthNum] = month.split('-').map(Number) as [number, number];
  const days = useMemo(() => monthDays(year, monthNum), [year, monthNum]);
  const from = days[0] ?? `${month}-01`;
  const to = days[days.length - 1] ?? `${month}-28`;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const { data: units } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
  });

  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'grid', { from, to, orgUnitId }],
    queryFn: () => {
      const qs = new URLSearchParams({ from, to });
      if (orgUnitId !== ALL) qs.set('orgUnitId', orgUnitId);
      return api.get<TimesheetGridRow[]>(`/attendance/grid?${qs.toString()}`);
    },
  });

  const invalidateGrid = () =>
    queryClient.invalidateQueries({ queryKey: ['attendance', 'grid'] });

  // Sau khi sửa/tính lại/reset: cập nhật dialog + làm mới lưới
  const onTimesheetChanged = (day: TimesheetDayResponse | null) => {
    setDetail((d) =>
      d && day ? { ...d, day } : day === null ? null : d,
    );
    void invalidateGrid();
  };

  const recalcMut = useMutation({
    mutationFn: (v: { employeeId: string; date: string }) =>
      api.post<TimesheetDayResponse | null>('/attendance/timesheet/recalc', v),
    onSuccess: (day) => {
      toast.success('Đã tính lại công');
      onTimesheetChanged(day);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Lỗi'),
  });
  const resetMut = useMutation({
    mutationFn: (v: { employeeId: string; date: string }) =>
      api.post<TimesheetDayResponse | null>('/attendance/timesheet/reset', v),
    onSuccess: (day) => {
      toast.success('Đã reset (xóa) công ngày');
      onTimesheetChanged(day);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Lỗi'),
  });
  const editMut = useMutation({
    mutationFn: (v: {
      employeeId: string;
      date: string;
      firstIn: string;
      lastOut: string | null;
      note: string | null;
    }) => api.patch<TimesheetDayResponse>('/attendance/timesheet', v),
    onSuccess: (day) => {
      toast.success('Đã sửa & khóa công ngày');
      onTimesheetChanged(day);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Lỗi'),
  });

  const rows = useMemo(() => data ?? [], [data]);

  // Tổng hợp toàn bảng cho cards trên cùng
  const totals = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    for (const r of rows) {
      for (const d of Object.values(r.days)) {
        if (PRESENT_SET.includes(d.status)) present++;
        if (d.lateMinutes > 0) late++;
        if (d.status === 'ABSENT') absent++;
      }
    }
    return { employees: rows.length, present, late, absent };
  }, [rows]);

  function rowSummary(row: TimesheetGridRow) {
    let present = 0;
    let late = 0;
    let absent = 0;
    for (const d of Object.values(row.days)) {
      if (PRESENT_SET.includes(d.status)) present++;
      if (d.lateMinutes > 0) late++;
      if (d.status === 'ABSENT') absent++;
    }
    return { present, late, absent };
  }

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, monthNum - 1 + delta, 1));
    setMonth(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    );
  }

  const legend: TimesheetStatus[] = [
    'PRESENT',
    'LATE',
    'EARLY_LEAVE',
    'ABSENT',
    'ON_LEAVE',
    'HOLIDAY',
    'WEEKEND',
  ];

  return (
    <FadeIn className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bảng công tháng</h1>
          <p className="text-muted-foreground">
            Toàn bộ ngày trong tháng · click ô để xem chi tiết
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border p-2 hover:bg-accent"
            onClick={() => shiftMonth(-1)}
            aria-label="Tháng trước"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-28 text-center font-semibold tabular-nums">
            Tháng {monthNum}/{year}
          </span>
          <button
            className="rounded-md border p-2 hover:bg-accent"
            onClick={() => shiftMonth(1)}
            aria-label="Tháng sau"
          >
            <ChevronRight className="size-4" />
          </button>
          <Select value={orgUnitId} onValueChange={setOrgUnitId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Đơn vị" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi đơn vị</SelectItem>
              {(units ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards tổng hợp tháng */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Nhân viên', value: totals.employees, cls: '', icon: true },
          { label: 'Lượt đủ công', value: totals.present, cls: 'text-emerald-600' },
          { label: 'Lượt đi trễ', value: totals.late, cls: 'text-amber-600' },
          { label: 'Lượt vắng', value: totals.absent, cls: 'text-red-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              {s.icon && (
                <div className="flex size-9 items-center justify-center rounded-full bg-primary/10">
                  <Users className="size-4 text-primary" />
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={cn('text-2xl font-bold', s.cls)}>
                  <CountUp value={s.value} />
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chú giải */}
      <div className="flex flex-wrap gap-3 text-xs">
        {legend.map((st) => (
          <span key={st} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full', STATUS_META[st].dot)} />
            {STATUS_META[st].full}
          </span>
        ))}
      </div>

      {/* Lưới calendar */}
      {isLoading ? (
        <Skeleton className="h-130 w-full" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border py-16 text-center text-muted-foreground">
          Không có nhân viên nào trong phạm vi xem
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 w-48 min-w-48 border-b bg-card px-3 py-2 text-left font-semibold">
                  Nhân viên
                </th>
                {days.map((date) => {
                  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
                  const isWeekend = wd === 0 || wd === 6;
                  const isToday = date === todayStr;
                  return (
                    <th
                      key={date}
                      className={cn(
                        'border-b border-l px-0 py-1 text-center text-xs font-medium',
                        isWeekend && 'bg-muted/40',
                        isToday && 'bg-primary/10',
                      )}
                      style={{ minWidth: 34 }}
                    >
                      <div className={cn(isToday && 'font-bold text-primary')}>
                        {Number(date.slice(8))}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {WEEKDAY_VN[wd]}
                      </div>
                    </th>
                  );
                })}
                <th className="sticky right-0 z-20 border-b border-l bg-card px-2 py-2 text-center font-semibold">
                  Tổng
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const sum = rowSummary(row);
                return (
                  <tr key={row.employeeId} className="group">
                    <td className="sticky left-0 z-10 border-b bg-card px-3 py-1.5 group-hover:bg-accent/40">
                      <div className="font-medium leading-tight">{row.employeeName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.employeeCode}
                        {row.orgUnitName ? ` · ${row.orgUnitName}` : ''}
                      </div>
                    </td>
                    {days.map((date) => {
                      const day = row.days[date];
                      const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
                      const isWeekend = wd === 0 || wd === 6;
                      const meta = day ? STATUS_META[day.status] : null;
                      return (
                        <td
                          key={date}
                          className={cn(
                            'border-b border-l p-0.5 text-center',
                            isWeekend && 'bg-muted/20',
                          )}
                        >
                          {day && meta ? (
                            <button
                              type="button"
                              onClick={() =>
                                setDetail({
                                  employeeId: row.employeeId,
                                  name: row.employeeName,
                                  date,
                                  day,
                                })
                              }
                              title={`${meta.full}${day.lateMinutes ? ` · trễ ${day.lateMinutes}p` : ''}${day.earlyMinutes ? ` · sớm ${day.earlyMinutes}p` : ''}`}
                              className={cn(
                                'flex h-7 w-full items-center justify-center rounded text-[11px] font-semibold transition-transform hover:scale-110',
                                meta.cell,
                              )}
                            >
                              {meta.label}
                            </button>
                          ) : (
                            <span className="block h-7" />
                          )}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 border-b border-l bg-card px-2 py-1.5 group-hover:bg-accent/40">
                      <div className="flex items-center justify-center gap-1.5 text-xs font-semibold tabular-nums">
                        <span className="text-emerald-600" title="Đủ công">
                          {sum.present}
                        </span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-amber-600" title="Trễ">
                          {sum.late}
                        </span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-red-600" title="Vắng">
                          {sum.absent}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog chi tiết 1 ngày */}
      <Dialog
        open={detail !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDetail(null);
            setEditForm(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail?.name}
              {detail?.day.locked && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Lock className="size-3" /> Đã khóa
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {detail?.date} ·{' '}
              {detail ? STATUS_META[detail.day.status].full : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Giờ vào</span>
                  <span className="font-medium tabular-nums">
                    {timeStr(detail.day.firstIn)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Giờ ra</span>
                  <span className="font-medium tabular-nums">
                    {timeStr(detail.day.lastOut)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Đi trễ</span>
                  <span className="font-medium">{detail.day.lateMinutes} phút</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Về sớm</span>
                  <span className="font-medium">{detail.day.earlyMinutes} phút</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Giờ công</span>
                  <span className="font-medium">
                    {Math.floor(detail.day.workMinutes / 60)}h{' '}
                    {detail.day.workMinutes % 60}p
                  </span>
                </div>
                {detail.day.otMinutes > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tăng ca</span>
                    <span className="font-medium">{detail.day.otMinutes} phút</span>
                  </div>
                )}
                {detail.day.note && (
                  <p className="rounded bg-muted/50 p-2 text-xs text-muted-foreground">
                    Ghi chú: {detail.day.note}
                  </p>
                )}
              </div>

              {/* Hành động HR (ORG_ADMIN / HR_MANAGER) */}
              <PermissionGate permission={PERMISSIONS.ATTENDANCE_CORRECT}>
                {editForm ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-xs font-medium">Sửa giờ công (sẽ khóa ngày)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Giờ vào</Label>
                        <Input
                          type="time"
                          value={editForm.firstIn}
                          onChange={(e) =>
                            setEditForm({ ...editForm, firstIn: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Giờ ra</Label>
                        <Input
                          type="time"
                          value={editForm.lastOut}
                          onChange={(e) =>
                            setEditForm({ ...editForm, lastOut: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ghi chú</Label>
                      <Input
                        value={editForm.note}
                        placeholder="Lý do sửa"
                        onChange={(e) =>
                          setEditForm({ ...editForm, note: e.target.value })
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={!editForm.firstIn || editMut.isPending}
                        onClick={() =>
                          editMut.mutate({
                            employeeId: detail.employeeId,
                            date: detail.date,
                            firstIn: editForm.firstIn,
                            lastOut: editForm.lastOut || null,
                            note: editForm.note || null,
                          })
                        }
                      >
                        Lưu & khóa
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditForm(null)}
                      >
                        Huỷ
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={recalcMut.isPending}
                      onClick={() =>
                        recalcMut.mutate({
                          employeeId: detail.employeeId,
                          date: detail.date,
                        })
                      }
                    >
                      <RotateCcw className="size-3.5" /> Tính lại
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setEditForm({
                          firstIn: toHHmm(detail.day.firstIn) || '08:00',
                          lastOut: toHHmm(detail.day.lastOut),
                          note: detail.day.note ?? '',
                        })
                      }
                    >
                      <Pencil className="size-3.5" /> Sửa giờ
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={resetMut.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Xóa toàn bộ chấm công ngày ${detail.date} của ${detail.name}?`,
                          )
                        )
                          resetMut.mutate({
                            employeeId: detail.employeeId,
                            date: detail.date,
                          });
                      }}
                    >
                      <Trash2 className="size-3.5" /> Xóa công
                    </Button>
                  </div>
                )}
              </PermissionGate>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </FadeIn>
  );
}
