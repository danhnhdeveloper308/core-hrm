'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  PERMISSIONS,
  createWorkShiftSchema,
  type CreateWorkShiftInput,
  type HolidayCalendarResponse,
  type OrganizationResponse,
  type OrgUnitResponse,
  type WorkShiftResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCog, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FadeIn } from '@/components/motion/primitives';
import { PermissionGate } from '@/components/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

const WEEKDAY_LABELS = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const NONE = '__none__';

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WorkShiftResponse | null>(null);
  const [assignTarget, setAssignTarget] = useState<WorkShiftResponse | null>(null);

  const { data: shifts, isLoading } = useQuery({
    queryKey: queryKeys.org.shifts,
    queryFn: () => api.get<WorkShiftResponse[]>('/shifts'),
  });
  const { data: calendars } = useQuery({
    queryKey: queryKeys.org.calendars,
    queryFn: () => api.get<HolidayCalendarResponse[]>('/holiday-calendars'),
  });
  const { data: org } = useQuery({
    queryKey: queryKeys.org.info,
    queryFn: () => api.get<OrganizationResponse>('/org'),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.org.shifts });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/shifts/${id}`),
    onSuccess: (res) => {
      toast.success(res.message);
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
  });

  const orgDefaults = useMutation({
    mutationFn: (body: { defaultShiftId?: string | null; defaultCalendarId?: string | null }) =>
      api.patch<{ message: string }>('/schedule/org-defaults', body),
    onSuccess: (res) => toast.success(res.message),
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Cập nhật thất bại'),
  });

  return (
    <FadeIn className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ca làm việc</h1>
          <p className="text-muted-foreground">
            Định nghĩa ca, gán cho đơn vị, đặt mặc định toàn tổ chức
          </p>
        </div>
        <PermissionGate permission={PERMISSIONS.SHIFT_MANAGE}>
          <Button
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Tạo ca
          </Button>
        </PermissionGate>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên ca</TableHead>
              <TableHead>Giờ</TableHead>
              <TableHead>Ngày làm việc</TableHead>
              <TableHead>Grace trễ</TableHead>
              <TableHead>OT</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : (
              (shifts ?? []).map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell className="font-medium">{shift.name}</TableCell>
                  <TableCell>
                    {shift.startTime}–{shift.endTime}
                    <span className="ml-1 text-xs text-muted-foreground">
                      (nghỉ {shift.breakMinutes}p)
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {shift.workDays.map((d) => (
                        <Badge key={d} variant="outline" className="px-1.5 text-xs">
                          {WEEKDAY_LABELS[d]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{shift.lateGraceMinutes}p</TableCell>
                  <TableCell>{shift.otEnabled ? 'Có' : '—'}</TableCell>
                  <TableCell>
                    <PermissionGate permission={PERMISSIONS.SHIFT_MANAGE}>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          title="Gán ca cho đơn vị"
                          onClick={() => setAssignTarget(shift)}
                        >
                          <Users className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => {
                            setEditTarget(shift);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive"
                          onClick={() => deleteMutation.mutate(shift.id)}
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

      <PermissionGate permission={PERMISSIONS.SHIFT_MANAGE}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCog className="size-4" /> Mặc định toàn tổ chức {org ? `— ${org.name}` : ''}
            </CardTitle>
            <CardDescription>
              Nhân viên không có gán ca riêng và đơn vị không cấu hình sẽ dùng giá
              trị này
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Ca mặc định</Label>
              <Select
                onValueChange={(v) =>
                  orgDefaults.mutate({ defaultShiftId: v === NONE ? null : v })
                }
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Chọn ca mặc định" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không đặt —</SelectItem>
                  {(shifts ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Lịch nghỉ lễ mặc định</Label>
              <Select
                onValueChange={(v) =>
                  orgDefaults.mutate({ defaultCalendarId: v === NONE ? null : v })
                }
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Chọn lịch lễ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không đặt —</SelectItem>
                  {(calendars ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </PermissionGate>

      <ShiftFormDialog
        open={formOpen}
        target={editTarget}
        onClose={() => setFormOpen(false)}
        onSaved={() => void invalidate()}
      />
      <AssignShiftDialog
        shift={assignTarget}
        onClose={() => setAssignTarget(null)}
      />
    </FadeIn>
  );
}

// ===== Form ca =====

function ShiftFormDialog({
  open,
  target,
  onClose,
  onSaved,
}: {
  open: boolean;
  target: WorkShiftResponse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target !== null;
  const form = useForm<
    z.input<typeof createWorkShiftSchema>,
    unknown,
    CreateWorkShiftInput
  >({
    resolver: zodResolver(createWorkShiftSchema),
    defaultValues: {
      name: '',
      startTime: '08:00',
      endTime: '17:00',
      breakStart: '',
      breakEnd: '',
      breakMinutes: 60,
      lateGraceMinutes: 5,
      otEnabled: false,
      workDays: [1, 2, 3, 4, 5],
    },
    values: open
      ? {
          name: target?.name ?? '',
          startTime: target?.startTime ?? '08:00',
          endTime: target?.endTime ?? '17:00',
          breakStart: target?.breakStart ?? '',
          breakEnd: target?.breakEnd ?? '',
          breakMinutes: target?.breakMinutes ?? 60,
          lateGraceMinutes: target?.lateGraceMinutes ?? 5,
          otEnabled: target?.otEnabled ?? false,
          workDays: target?.workDays ?? [1, 2, 3, 4, 5],
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (values: CreateWorkShiftInput) =>
      isEdit
        ? api.patch<WorkShiftResponse>(`/shifts/${target.id}`, values)
        : api.post<WorkShiftResponse>('/shifts', values),
    onSuccess: (saved) => {
      toast.success(isEdit ? `Đã cập nhật ${saved.name}` : `Đã tạo ca ${saved.name}`);
      onSaved();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Lưu thất bại'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Sửa ca ${target.name}` : 'Tạo ca làm việc'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên ca</FormLabel>
                  <FormControl>
                    <Input placeholder="Ca hành chính" {...field} />
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
                    <FormLabel>Giờ vào</FormLabel>
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
                    <FormLabel>Giờ ra</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="breakStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bắt đầu nghỉ trưa</FormLabel>
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
                name="breakEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kết thúc nghỉ trưa</FormLabel>
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
            <p className="-mt-2 text-xs text-muted-foreground">
              Đặt cửa sổ nghỉ trưa để giờ công trừ đúng phần giao. Bỏ trống thì dùng
              &quot;nghỉ giữa ca (phút)&quot; trừ cứng.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="breakMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nghỉ giữa ca (phút)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lateGraceMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grace trễ (phút)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="workDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ngày làm việc</FormLabel>
                  <div className="flex gap-3">
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const checked = (field.value ?? []).includes(d);
                      return (
                        <label key={d} className="flex items-center gap-1 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) => {
                              const current = field.value ?? [];
                              field.onChange(
                                c
                                  ? [...current, d].sort()
                                  : current.filter((x) => x !== d),
                              );
                            }}
                          />
                          {WEEKDAY_LABELS[d]}
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="otEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Cho phép tính OT ngoài ca</FormLabel>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ===== Gán ca cho đơn vị =====

function AssignShiftDialog({
  shift,
  onClose,
}: {
  shift: WorkShiftResponse | null;
  onClose: () => void;
}) {
  const [orgUnitId, setOrgUnitId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const { data: units } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
    enabled: shift !== null,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ assigned: number }>('/shifts/assign', {
        shiftId: shift?.id,
        orgUnitId,
        effectiveFrom,
      }),
    onSuccess: ({ assigned }) => {
      toast.success(`Đã gán ca cho ${assigned} nhân viên`);
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Gán ca thất bại'),
  });

  return (
    <Dialog open={shift !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gán ca {shift?.name} cho đơn vị</DialogTitle>
          <DialogDescription>
            Áp dụng cho TOÀN BỘ nhân viên trong subtree của đơn vị từ ngày hiệu lực.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Đơn vị</Label>
            <Select value={orgUnitId} onValueChange={setOrgUnitId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn đơn vị" />
              </SelectTrigger>
              <SelectContent>
                {(units ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.typeName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hiệu lực từ</Label>
            <Input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!orgUnitId || mutation.isPending}
          >
            {mutation.isPending ? 'Đang gán…' : 'Gán ca'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
