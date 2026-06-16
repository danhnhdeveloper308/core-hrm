'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createOtRequestSchema,
  requestCorrectionSchema,
  type AttendanceLogResponse,
  type CorrectionRequestResponse,
  type CreateOtRequestInput,
  type OtRequestResponse,
  type RequestCorrectionInput,
  type TimesheetDayResponse,
  type TimesheetStatus,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardEdit, Clock4, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { AttachmentPicker } from '@/components/attachments/attachment-picker';
import { FadeIn } from '@/components/motion/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { uploadAttachments } from '@/lib/api/attachments';
import { api, ApiError } from '@/lib/api/client';
import { formatMinutes } from '@/lib/format';

const CORRECTION_STATUS: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  PENDING: { label: 'Chờ duyệt', variant: 'secondary' },
  APPROVED: { label: 'Đã duyệt', variant: 'default' },
  REJECTED: { label: 'Từ chối', variant: 'destructive' },
  CANCELLED: { label: 'Đã huỷ', variant: 'outline' },
};

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
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [otOpen, setOtOpen] = useState(false);
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

  const { data: corrections } = useQuery({
    queryKey: ['attendance', 'corrections', 'mine'],
    queryFn: () =>
      api.get<CorrectionRequestResponse[]>('/attendance/corrections/mine'),
  });

  const { data: otRequests } = useQuery({
    queryKey: ['attendance', 'ot', 'mine'],
    queryFn: () => api.get<OtRequestResponse[]>('/attendance/ot/mine'),
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Chấm công của tôi</h1>
          <p className="text-muted-foreground">Lịch sử chấm công và bảng công cá nhân</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCorrectionOpen(true)}>
            <ClipboardEdit className="size-4" /> Xin sửa công
          </Button>
          <Button variant="outline" onClick={() => setOtOpen(true)}>
            <Clock4 className="size-4" /> Tăng ca / đổi giờ
          </Button>
        </div>
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
                      {day.lateMinutes > 0 ? `trễ ${formatMinutes(day.lateMinutes)}` : ''}
                      {day.lateMinutes > 0 && day.earlyMinutes > 0 ? ' · ' : ''}
                      {day.earlyMinutes > 0 ? `sớm ${formatMinutes(day.earlyMinutes)}` : ''}
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

      {(corrections ?? []).length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Đơn sửa công của tôi</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Giờ vào xin</TableHead>
                  <TableHead>Giờ ra xin</TableHead>
                  <TableHead>Lý do</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(corrections ?? []).map((c) => {
                  const meta = CORRECTION_STATUS[c.status] ?? CORRECTION_STATUS.PENDING!;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{c.date.slice(0, 10)}</TableCell>
                      <TableCell className="tabular-nums">{timeStr(c.requestedIn)}</TableCell>
                      <TableCell className="tabular-nums">{timeStr(c.requestedOut)}</TableCell>
                      <TableCell className="max-w-48 truncate" title={c.reason}>
                        {c.reason}
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {(otRequests ?? []).length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Đơn tăng ca / đổi giờ của tôi</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Khung giờ</TableHead>
                  <TableHead>Lý do</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(otRequests ?? []).map((o) => {
                  const meta = CORRECTION_STATUS[o.status] ?? CORRECTION_STATUS.PENDING!;
                  return (
                    <TableRow key={o.id}>
                      <TableCell>{o.date.slice(0, 10)}</TableCell>
                      <TableCell>
                        {o.type === 'OVERTIME' ? 'Tăng ca' : 'Đổi giờ'}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {timeStr(o.startTime)}–{timeStr(o.endTime)}
                      </TableCell>
                      <TableCell className="max-w-48 truncate" title={o.reason}>
                        {o.reason}
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <CorrectionRequestDialog
        open={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
      />
      <OtRequestDialog open={otOpen} onClose={() => setOtOpen(false)} />
    </FadeIn>
  );
}

// ===== Dialog xin sửa công =====

function CorrectionRequestDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<
    z.input<typeof requestCorrectionSchema>,
    unknown,
    RequestCorrectionInput
  >({
    resolver: zodResolver(requestCorrectionSchema),
    defaultValues: { date: today, requestedIn: '', requestedOut: '', reason: '' },
  });

  const mutation = useMutation({
    mutationFn: async (values: RequestCorrectionInput) => {
      const created = await api.post<{ id: string }>(
        '/attendance/corrections/request',
        values,
      );
      if (files.length > 0) {
        await uploadAttachments('ATTENDANCE_CORRECTION', created.id, files);
      }
      return created;
    },
    onSuccess: () => {
      toast.success('Đã gửi yêu cầu sửa công — chờ duyệt');
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'corrections', 'mine'] });
      form.reset();
      setFiles([]);
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Gửi yêu cầu thất bại'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xin sửa công</DialogTitle>
          <DialogDescription>
            Đề xuất giờ vào/ra đúng cho 1 ngày — áp dụng sau khi được duyệt.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ngày</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="requestedIn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Giờ vào (tuỳ chọn)</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requestedOut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Giờ ra (tuỳ chọn)</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lý do</FormLabel>
                  <FormControl>
                    <Input placeholder="VD: Quên chấm công ra" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <AttachmentPicker
              files={files}
              onChange={setFiles}
              label="Minh chứng (ảnh/PDF, không bắt buộc)"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Gửi yêu cầu
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ===== Dialog tăng ca / đổi giờ =====

function OtRequestDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<
    z.input<typeof createOtRequestSchema>,
    unknown,
    CreateOtRequestInput
  >({
    resolver: zodResolver(createOtRequestSchema),
    defaultValues: {
      type: 'OVERTIME',
      date: today,
      startTime: '17:30',
      endTime: '19:30',
      reason: '',
    },
  });
  const type = form.watch('type');

  const mutation = useMutation({
    mutationFn: (values: CreateOtRequestInput) =>
      api.post<{ id: string }>('/attendance/ot/request', values),
    onSuccess: () => {
      toast.success('Đã gửi yêu cầu — chờ duyệt');
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'ot', 'mine'] });
      form.reset();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Gửi yêu cầu thất bại'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tăng ca / đổi giờ</DialogTitle>
          <DialogDescription>
            Tăng ca: khung giờ làm thêm → cộng giờ OT. Đổi giờ: giờ vào/ra mới
            (giữ ca) → tính lại trễ/sớm. Áp dụng sau khi được duyệt.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại yêu cầu</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="OVERTIME">Tăng ca (làm thêm giờ)</SelectItem>
                      <SelectItem value="SHIFT_SHIFT">Đổi giờ vào/ra (giữ ca)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ngày</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{type === 'OVERTIME' ? 'OT từ' : 'Giờ vào mới'}</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{type === 'OVERTIME' ? 'OT đến' : 'Giờ ra mới'}</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lý do</FormLabel>
                  <FormControl>
                    <Input placeholder="VD: Làm gấp đơn hàng" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Gửi yêu cầu
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
