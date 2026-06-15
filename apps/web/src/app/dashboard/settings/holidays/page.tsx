'use client';

import {
  PERMISSIONS,
  type HolidayCalendarResponse,
  type HolidayResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FadeIn } from '@/components/motion/primitives';
import { PermissionGate } from '@/components/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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

export default function HolidaysPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCalendarName, setNewCalendarName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);

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

  const createCalendar = useMutation({
    mutationFn: () =>
      api.post<HolidayCalendarResponse>('/holiday-calendars', {
        name: newCalendarName,
      }),
    onSuccess: (calendar) => {
      toast.success(`Đã tạo lịch ${calendar.name}`);
      setNewCalendarName('');
      void invalidateCalendars();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Tạo thất bại'),
  });

  const deleteCalendar = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(`/holiday-calendars/${id}`),
    onSuccess: (res) => {
      toast.success(res.message);
      setSelectedId(null);
      void invalidateCalendars();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
  });

  const addHoliday = useMutation({
    mutationFn: () =>
      api.post<HolidayResponse>(`/holiday-calendars/${activeId}/holidays`, {
        date: holidayDate,
        name: holidayName,
        isHalfDay,
      }),
    onSuccess: () => {
      toast.success('Đã thêm ngày lễ');
      setHolidayDate('');
      setHolidayName('');
      setIsHalfDay(false);
      void invalidateHolidays();
      void invalidateCalendars();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Thêm thất bại'),
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
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
  });

  return (
    <FadeIn className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Lịch nghỉ lễ</h1>
        <p className="text-muted-foreground">
          Tạo lịch lễ, gán mặc định cho org/đơn vị ở trang Ca làm việc
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
                  onClick={() => setSelectedId(calendar.id)}
                >
                  <div>
                    <p className="font-medium">{calendar.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {calendar.holidayCount} ngày lễ
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
                  <Label className="text-xs">Ngày</Label>
                  <Input
                    type="date"
                    value={holidayDate}
                    onChange={(e) => setHolidayDate(e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Tên ngày lễ</Label>
                  <Input
                    placeholder="Quốc khánh"
                    value={holidayName}
                    onChange={(e) => setHolidayName(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-1.5 pb-2 text-sm">
                  <Checkbox
                    checked={isHalfDay}
                    onCheckedChange={(c) => setIsHalfDay(c === true)}
                  />
                  Nửa ngày
                </label>
                <Button
                  onClick={() => addHoliday.mutate()}
                  disabled={!holidayDate || !holidayName.trim() || addHoliday.isPending}
                >
                  <Plus className="size-4" /> Thêm
                </Button>
              </div>
            )}
          </PermissionGate>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Tên</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(holidays ?? []).map((holiday) => (
                  <TableRow key={holiday.id}>
                    <TableCell className="font-mono text-sm">{holiday.date}</TableCell>
                    <TableCell>{holiday.name}</TableCell>
                    <TableCell>
                      <Badge variant={holiday.isHalfDay ? 'secondary' : 'default'}>
                        {holiday.isHalfDay ? 'Nửa ngày' : 'Cả ngày'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <PermissionGate permission={PERMISSIONS.SHIFT_MANAGE}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive"
                          onClick={() => removeHoliday.mutate(holiday.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </PermissionGate>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </FadeIn>
  );
}
