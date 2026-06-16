'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createLeaveRequestSchema,
  type CreateLeaveRequestInput,
  type LeaveBalanceResponse,
  type LeaveLedgerEntryResponse,
  type LeaveRequestResponse,
  type LeaveTypeResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Loader2, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FadeIn } from '@/components/motion/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import {
  HALF_LABELS,
  LEAVE_ENTRY_LABELS,
  LEAVE_STATUS_BADGE,
  LEAVE_STATUS_LABELS,
  fmtDate,
  fmtDays,
} from './shared';

const NOW_YEAR = new Date().getUTCFullYear();
const YEARS = [NOW_YEAR + 1, NOW_YEAR, NOW_YEAR - 1, NOW_YEAR - 2];

export default function LeavePage() {
  const [year, setYear] = useState(NOW_YEAR);
  const [formOpen, setFormOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: balances, isLoading: loadingBalance } = useQuery({
    queryKey: queryKeys.leave.balanceMe(year),
    queryFn: () =>
      api.get<LeaveBalanceResponse[]>(`/leave/balance/me?year=${year}`),
  });
  const { data: requests, isLoading: loadingReq } = useQuery({
    queryKey: queryKeys.leave.requests({ scope: 'mine' }),
    queryFn: () =>
      api.get<LeaveRequestResponse[]>('/leave/requests?scope=mine'),
  });
  const { data: ledger } = useQuery({
    queryKey: queryKeys.leave.ledgerMe(year),
    queryFn: () =>
      api.get<LeaveLedgerEntryResponse[]>(`/leave/ledger/me?year=${year}`),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<LeaveRequestResponse>(`/leave/requests/${id}/cancel`),
    onSuccess: () => {
      toast.success('Đã huỷ đơn');
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Huỷ thất bại'),
  });

  return (
    <FadeIn className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Nghỉ phép</h1>
          <p className="text-muted-foreground">
            Số dư phép, tạo đơn và theo dõi trạng thái duyệt
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  Năm {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> Tạo đơn nghỉ
          </Button>
        </div>
      </div>

      {/* Thẻ số dư */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loadingBalance ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))
        ) : (balances ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có loại phép nào được cấu hình cho năm {year}.
          </p>
        ) : (
          (balances ?? []).map((b) => (
            <Card key={b.leaveTypeId}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span
                    className="inline-block size-3 rounded-full"
                    style={{ backgroundColor: b.leaveTypeColor }}
                  />
                  {b.leaveTypeName}
                  {!b.paid && (
                    <Badge variant="outline" className="text-xs">
                      không lương
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{fmtDays(b.available)}</span>
                  <span className="text-sm text-muted-foreground">
                    / {fmtDays(b.accrued)} ngày khả dụng
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span>Đã dùng: {fmtDays(b.used)}</span>
                  <span>Chờ duyệt: {fmtDays(b.pending)}</span>
                </div>
                {b.carryOverExpiring > 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    {fmtDays(b.carryOverExpiring)} ngày chuyển kỳ sắp hết hạn
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Đơn của tôi</TabsTrigger>
          <TabsTrigger value="ledger">Lịch sử phép</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loại phép</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Số ngày</TableHead>
                  <TableHead>Lý do</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingReq ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ) : (requests ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Chưa có đơn nghỉ nào.
                    </TableCell>
                  </TableRow>
                ) : (
                  (requests ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.leaveTypeName}</TableCell>
                      <TableCell>
                        {fmtDate(r.startDate)}
                        {r.startHalf !== 'FULL' && (
                          <span className="text-xs text-muted-foreground">
                            {' '}
                            ({HALF_LABELS[r.startHalf]})
                          </span>
                        )}
                        {r.endDate !== r.startDate && (
                          <>
                            {' → '}
                            {fmtDate(r.endDate)}
                            {r.endHalf !== 'FULL' && (
                              <span className="text-xs text-muted-foreground">
                                {' '}
                                ({HALF_LABELS[r.endHalf]})
                              </span>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>{fmtDays(r.totalDays)}</TableCell>
                      <TableCell className="max-w-48 truncate" title={r.reason}>
                        {r.reason}
                      </TableCell>
                      <TableCell>
                        <Badge variant={LEAVE_STATUS_BADGE[r.status]}>
                          {LEAVE_STATUS_LABELS[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(r.status === 'PENDING' || r.status === 'APPROVED') && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-destructive"
                            title="Huỷ đơn"
                            disabled={cancelMutation.isPending}
                            onClick={() => cancelMutation.mutate(r.id)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="ledger">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Loại bút toán</TableHead>
                  <TableHead>Số ngày</TableHead>
                  <TableHead>Diễn giải</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ledger ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Chưa có bút toán phép năm {year}.
                    </TableCell>
                  </TableRow>
                ) : (
                  (ledger ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{fmtDate(e.createdAt)}</TableCell>
                      <TableCell>{LEAVE_ENTRY_LABELS[e.type]}</TableCell>
                      <TableCell
                        className={e.amount < 0 ? 'text-destructive' : 'text-emerald-600'}
                      >
                        {e.amount > 0 ? '+' : ''}
                        {fmtDays(e.amount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{e.reason}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <RequestFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </FadeIn>
  );
}

// ===== Form tạo đơn =====

function RequestFormDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: types } = useQuery({
    queryKey: queryKeys.leave.types,
    queryFn: () => api.get<LeaveTypeResponse[]>('/leave/types'),
    enabled: open,
  });

  const form = useForm<
    z.input<typeof createLeaveRequestSchema>,
    unknown,
    CreateLeaveRequestInput
  >({
    resolver: zodResolver(createLeaveRequestSchema),
    defaultValues: {
      leaveTypeId: '',
      startDate: today,
      endDate: today,
      startHalf: 'FULL',
      endHalf: 'FULL',
      reason: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateLeaveRequestInput) =>
      api.post<LeaveRequestResponse>('/leave/requests', values),
    onSuccess: () => {
      toast.success('Đã gửi đơn nghỉ — chờ duyệt');
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
      form.reset();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Gửi đơn thất bại'),
  });

  const startDate = form.watch('startDate');
  const endDate = form.watch('endDate');
  const sameDay = startDate === endDate;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-5" /> Tạo đơn nghỉ phép
          </DialogTitle>
          <DialogDescription>
            Số ngày tính theo ngày làm việc (trừ cuối tuần &amp; ngày lễ).
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="leaveTypeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại phép</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Chọn loại phép" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(types ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} {t.paid ? '' : '(không lương)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Từ ngày</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Đến ngày</FormLabel>
                    <FormControl>
                      <Input type="date" min={startDate} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startHalf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{sameDay ? 'Buổi nghỉ' : 'Buổi (ngày đầu)'}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="FULL">Cả ngày</SelectItem>
                        <SelectItem value="AM">Buổi sáng</SelectItem>
                        <SelectItem value="PM">Buổi chiều</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!sameDay && (
                <FormField
                  control={form.control}
                  name="endHalf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buổi (ngày cuối)</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="FULL">Cả ngày</SelectItem>
                          <SelectItem value="AM">Buổi sáng</SelectItem>
                          <SelectItem value="PM">Buổi chiều</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lý do</FormLabel>
                  <FormControl>
                    <Input placeholder="Lý do nghỉ" {...field} />
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
                Gửi đơn
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
