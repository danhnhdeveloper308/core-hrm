'use client';

import {
  PERMISSIONS,
  type HolidayCalendarResponse,
  type HolidayResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FadeIn } from '@/components/motion/primitives';
import { PermissionGate } from '@/components/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { cn } from '@/lib/utils';

/** Số ngày của 1 kỳ nghỉ [start,end] (bao gồm cả 2 đầu). */
function rangeDays(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export default function HolidaysPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCalendarName, setNewCalendarName] = useState('');
  // Form thêm/sửa kỳ nghỉ
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hStart, setHStart] = useState('');
  const [hEnd, setHEnd] = useState('');
  const [hName, setHName] = useState('');

  const { data: calendars, isLoading } = useQuery({
    queryKey: queryKeys.org.calendars,
    queryFn: () => api.get<HolidayCalendarResponse[]>('/holiday-calendars'),
  });
  const activeId = selectedId ?? calendars?.[0]?.id ?? null;

  const { data: holidays } = useQuery({
    queryKey: queryKeys.org.holidays(activeId ?? ''),
    queryFn: () => api.get<HolidayResponse[]>(`/holiday-calendars/${activeId}/holidays`),
    enabled: activeId !== null,
  });

  const invalidateCalendars = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.org.calendars });
  const invalidateHolidays = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.org.holidays(activeId ?? '') });

  function resetForm() {
    setEditingId(null);
    setHStart('');
    setHEnd('');
    setHName('');
  }

  const createCalendar = useMutation({
    mutationFn: () =>
      api.post<HolidayCalendarResponse>('/holiday-calendars', { name: newCalendarName }),
    onSuccess: (calendar) => {
      toast.success(`Đã tạo lịch ${calendar.name}`);
      setNewCalendarName('');
      void invalidateCalendars();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Tạo thất bại'),
  });

  const deleteCalendar = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(`/holiday-calendars/${id}`),
    onSuccess: (res) => {
      toast.success(res.message);
      setSelectedId(null);
      void invalidateCalendars();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Xoá thất bại'),
  });

  const saveHoliday = useMutation({
    mutationFn: () => {
      const body = {
        startDate: hStart,
        endDate: hEnd || hStart,
        name: hName,
      };
      return editingId
        ? api.patch<HolidayResponse>(
            `/holiday-calendars/${activeId}/holidays/${editingId}`,
            body,
          )
        : api.post<HolidayResponse>(`/holiday-calendars/${activeId}/holidays`, body);
    },
    onSuccess: () => {
      toast.success(editingId ? 'Đã cập nhật kỳ nghỉ' : 'Đã thêm kỳ nghỉ');
      resetForm();
      void invalidateHolidays();
      void invalidateCalendars();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });

  const removeHoliday = useMutation({
    mutationFn: (holidayId: string) =>
      api.delete<{ message: string }>(
        `/holiday-calendars/${activeId}/holidays/${holidayId}`,
      ),
    onSuccess: (res) => {
      toast.success(res.message);
      void invalidateHolidays();
      void invalidateCalendars();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Xoá thất bại'),
  });

  return (
    <FadeIn className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Lịch nghỉ lễ</h1>
        <p className="text-muted-foreground">
          Mỗi kỳ nghỉ là một khoảng ngày (vd nghỉ Tết 7 ngày). Gán mặc định ở
          trang Ca làm việc.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4" /> Danh sách lịch
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              (calendars ?? []).map((calendar) => (
                <div
                  key={calendar.id}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-md border p-2 text-sm',
                    activeId === calendar.id && 'border-primary bg-accent/50',
                  )}
                  onClick={() => {
                    setSelectedId(calendar.id);
                    resetForm();
                  }}
                >
                  <div>
                    <p className="font-medium">{calendar.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {calendar.holidayCount} kỳ nghỉ
                    </p>
                  </div>
                  <PermissionGate permission={PERMISSIONS.SHIFT_MANAGE}>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCalendar.mutate(calendar.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </PermissionGate>
                </div>
              ))
            )}
            <PermissionGate permission={PERMISSIONS.SHIFT_MANAGE}>
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="Tên lịch mới…"
                  value={newCalendarName}
                  onChange={(e) => setNewCalendarName(e.target.value)}
                />
                <Button
                  size="icon"
                  onClick={() => createCalendar.mutate()}
                  disabled={!newCalendarName.trim() || createCalendar.isPending}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </PermissionGate>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <PermissionGate permission={PERMISSIONS.SHIFT_MANAGE}>
            {activeId && (
              <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                <div className="space-y-1">
                  <Label className="text-xs">Từ ngày</Label>
                  <Input
                    type="date"
                    value={hStart}
                    onChange={(e) => setHStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Đến ngày</Label>
                  <Input
                    type="date"
                    value={hEnd}
                    onChange={(e) => setHEnd(e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Tên kỳ nghỉ</Label>
                  <Input
                    placeholder="Nghỉ Tết Nguyên đán"
                    value={hName}
                    onChange={(e) => setHName(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() => saveHoliday.mutate()}
                  disabled={!hStart || !hName.trim() || saveHoliday.isPending}
                >
                  {editingId ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                  {editingId ? 'Cập nhật' : 'Thêm'}
                </Button>
                {editingId && (
                  <Button variant="outline" size="icon" onClick={resetForm}>
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            )}
          </PermissionGate>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khoảng nghỉ</TableHead>
                  <TableHead>Số ngày</TableHead>
                  <TableHead>Tên</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(holidays ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      Chưa có kỳ nghỉ nào
                    </TableCell>
                  </TableRow>
                ) : (
                  (holidays ?? []).map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-mono text-sm">
                        {h.startDate}
                        {h.endDate !== h.startDate ? ` → ${h.endDate}` : ''}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {rangeDays(h.startDate, h.endDate)} ngày
                        </Badge>
                      </TableCell>
                      <TableCell>{h.name}</TableCell>
                      <TableCell>
                        <PermissionGate permission={PERMISSIONS.SHIFT_MANAGE}>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => {
                                setEditingId(h.id);
                                setHStart(h.startDate);
                                setHEnd(h.endDate);
                                setHName(h.name);
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 text-destructive"
                              onClick={() => removeHoliday.mutate(h.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </PermissionGate>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </FadeIn>
  );
}
