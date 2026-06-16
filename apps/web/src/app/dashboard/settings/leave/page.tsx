'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createLeavePolicySchema,
  createLeaveTypeSchema,
  type CreateLeavePolicyInput,
  type CreateLeaveTypeInput,
  type CursorPaginated,
  type EmployeeResponse,
  type LeaveBalanceResponse,
  type LeavePolicyResponse,
  type LeaveTypeResponse,
  type OrgUnitResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FadeIn } from '@/components/motion/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  FormDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { fmtDays } from '../../leave/shared';

const ACCRUAL_LABELS: Record<string, string> = {
  YEARLY_UPFRONT: 'Cấp đầu năm',
  MONTHLY: 'Tích luỹ hàng tháng',
};
const ORG_DEFAULT = '__org__';

export default function LeaveConfigPage() {
  return (
    <FadeIn className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Cấu hình nghỉ phép</h1>
        <p className="text-muted-foreground">
          Loại phép, chính sách tích luỹ và số dư từng nhân viên
        </p>
      </div>
      <Tabs defaultValue="types">
        <TabsList>
          <TabsTrigger value="types">Loại phép</TabsTrigger>
          <TabsTrigger value="policies">Chính sách</TabsTrigger>
          <TabsTrigger value="balance">Số dư nhân viên</TabsTrigger>
        </TabsList>
        <TabsContent value="types">
          <TypesTab />
        </TabsContent>
        <TabsContent value="policies">
          <PoliciesTab />
        </TabsContent>
        <TabsContent value="balance">
          <BalanceTab />
        </TabsContent>
      </Tabs>
    </FadeIn>
  );
}

// ===== Loại phép =====

function TypesTab() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LeaveTypeResponse | null>(null);

  const { data: types, isLoading } = useQuery({
    queryKey: queryKeys.leave.types,
    queryFn: () => api.get<LeaveTypeResponse[]>('/leave/types'),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.leave.types });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/leave/types/${id}`),
    onSuccess: () => {
      toast.success('Đã xoá loại phép');
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditTarget(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" /> Thêm loại phép
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Mã</TableHead>
              <TableHead>Tính lương</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : (
              (types ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="flex items-center gap-2 font-medium">
                    <span
                      className="inline-block size-3 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t.code}</Badge>
                  </TableCell>
                  <TableCell>{t.paid ? 'Có lương' : 'Không lương'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => {
                          setEditTarget(t);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive"
                        onClick={() => deleteMutation.mutate(t.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <TypeFormDialog
        open={formOpen}
        target={editTarget}
        onClose={() => setFormOpen(false)}
        onSaved={() => void invalidate()}
      />
    </div>
  );
}

function TypeFormDialog({
  open,
  target,
  onClose,
  onSaved,
}: {
  open: boolean;
  target: LeaveTypeResponse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target !== null;
  const form = useForm<
    z.input<typeof createLeaveTypeSchema>,
    unknown,
    CreateLeaveTypeInput
  >({
    resolver: zodResolver(createLeaveTypeSchema),
    values: open
      ? {
          name: target?.name ?? '',
          code: target?.code ?? '',
          paid: target?.paid ?? true,
          color: target?.color ?? '#3b82f6',
          requiresDocument: target?.requiresDocument ?? false,
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (values: CreateLeaveTypeInput) =>
      isEdit
        ? api.patch<LeaveTypeResponse>(`/leave/types/${target.id}`, values)
        : api.post<LeaveTypeResponse>('/leave/types', values),
    onSuccess: () => {
      toast.success(isEdit ? 'Đã cập nhật' : 'Đã thêm loại phép');
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
          <DialogTitle>{isEdit ? 'Sửa loại phép' : 'Thêm loại phép'}</DialogTitle>
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
                  <FormLabel>Tên loại phép</FormLabel>
                  <FormControl>
                    <Input placeholder="Phép năm" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mã</FormLabel>
                  <FormControl>
                    <Input placeholder="ANNUAL" {...field} disabled={isEdit} />
                  </FormControl>
                  <FormDescription>Chữ in hoa, số, gạch dưới.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center gap-4">
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Màu</FormLabel>
                    <FormControl>
                      <Input type="color" className="h-9 w-16 p-1" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paid"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 pt-6">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Có tính lương</FormLabel>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="requiresDocument"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">
                    Cần giấy tờ đính kèm (bệnh, thai sản…) — form đăng ký sẽ hiện ô tải file
                  </FormLabel>
                </FormItem>
              )}
            />
            <p className="text-xs text-muted-foreground">
              Loại phép <b>không lương</b> sẽ không cần cấu hình chính sách (nghỉ không
              giới hạn, không trừ số dư).
            </p>
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

// ===== Chính sách =====

function PoliciesTab() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LeavePolicyResponse | null>(null);

  const { data: policies, isLoading } = useQuery({
    queryKey: queryKeys.leave.policies,
    queryFn: () => api.get<LeavePolicyResponse[]>('/leave/policies'),
  });
  const { data: units } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
  });
  const unitName = (id: string | null) =>
    id ? (units ?? []).find((u) => u.id === id)?.name ?? '—' : 'Toàn tổ chức';
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.leave.policies });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(`/leave/policies/${id}`),
    onSuccess: () => {
      toast.success('Đã xoá chính sách');
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditTarget(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" /> Thêm chính sách
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loại phép</TableHead>
              <TableHead>Phạm vi</TableHead>
              <TableHead>Ngày/năm</TableHead>
              <TableHead>Tích luỹ</TableHead>
              <TableHead>Thâm niên</TableHead>
              <TableHead>Chuyển kỳ</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : (
              (policies ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.leaveTypeName}</TableCell>
                  <TableCell>
                    {p.orgUnitId ? (
                      <Badge variant="outline">{unitName(p.orgUnitId)}</Badge>
                    ) : (
                      <Badge>Toàn tổ chức</Badge>
                    )}
                  </TableCell>
                  <TableCell>{fmtDays(p.daysPerYear)}</TableCell>
                  <TableCell>{ACCRUAL_LABELS[p.accrualType]}</TableCell>
                  <TableCell>
                    {p.seniorityBonusDays > 0
                      ? `+${p.seniorityBonusDays}/${p.seniorityEveryYears} năm`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {p.carryOverMaxDays > 0 ? `tối đa ${fmtDays(p.carryOverMaxDays)}` : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => {
                          setEditTarget(p);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive"
                        onClick={() => deleteMutation.mutate(p.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <PolicyFormDialog
        open={formOpen}
        target={editTarget}
        units={units ?? []}
        onClose={() => setFormOpen(false)}
        onSaved={() => void invalidate()}
      />
    </div>
  );
}

function PolicyFormDialog({
  open,
  target,
  units,
  onClose,
  onSaved,
}: {
  open: boolean;
  target: LeavePolicyResponse | null;
  units: OrgUnitResponse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target !== null;
  const { data: types } = useQuery({
    queryKey: queryKeys.leave.types,
    queryFn: () => api.get<LeaveTypeResponse[]>('/leave/types'),
    enabled: open,
  });

  const form = useForm<
    z.input<typeof createLeavePolicySchema>,
    unknown,
    CreateLeavePolicyInput
  >({
    resolver: zodResolver(createLeavePolicySchema),
    values: open
      ? {
          leaveTypeId: target?.leaveTypeId ?? '',
          orgUnitId: target?.orgUnitId ?? null,
          daysPerYear: target?.daysPerYear ?? 12,
          accrualType: target?.accrualType ?? 'YEARLY_UPFRONT',
          prorateFirstYear: target?.prorateFirstYear ?? true,
          seniorityBonusDays: target?.seniorityBonusDays ?? 0,
          seniorityEveryYears: target?.seniorityEveryYears ?? 5,
          carryOverMaxDays: target?.carryOverMaxDays ?? 0,
          carryOverExpiresOn: target?.carryOverExpiresOn ?? null,
          allowNegativeBalance: target?.allowNegativeBalance ?? false,
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (values: CreateLeavePolicyInput) =>
      isEdit
        ? api.patch<LeavePolicyResponse>(`/leave/policies/${target.id}`, values)
        : api.post<LeavePolicyResponse>('/leave/policies', values),
    onSuccess: () => {
      toast.success(isEdit ? 'Đã cập nhật chính sách' : 'Đã thêm chính sách');
      onSaved();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Lưu thất bại'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Sửa chính sách' : 'Thêm chính sách'}</DialogTitle>
          <DialogDescription>
            Chính sách theo đơn vị sẽ ghi đè mặc định toàn tổ chức cho nhánh đó.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="leaveTypeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loại phép</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isEdit}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Chọn loại" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(types ?? [])
                          .filter((t) => t.paid)
                          .map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="orgUnitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phạm vi</FormLabel>
                    <Select
                      value={field.value ?? ORG_DEFAULT}
                      onValueChange={(v) => field.onChange(v === ORG_DEFAULT ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={ORG_DEFAULT}>Toàn tổ chức</SelectItem>
                        {units.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name} ({u.typeName})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="daysPerYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Số ngày/năm</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.5"
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
                name="accrualType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kiểu tích luỹ</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="YEARLY_UPFRONT">Cấp đầu năm</SelectItem>
                        <SelectItem value="MONTHLY">Tích luỹ hàng tháng</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="seniorityBonusDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Thưởng thâm niên (ngày)</FormLabel>
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
                name="seniorityEveryYears"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mỗi (năm)</FormLabel>
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
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="carryOverMaxDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chuyển kỳ tối đa (ngày)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.5"
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
                name="carryOverExpiresOn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hạn dùng chuyển kỳ (MM-DD)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="03-31"
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
            <div className="flex gap-6">
              <FormField
                control={form.control}
                name="prorateFirstYear"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Tính theo tỉ lệ năm đầu</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="allowNegativeBalance"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Cho phép âm số dư</FormLabel>
                  </FormItem>
                )}
              />
            </div>
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

// ===== Số dư nhân viên (HR) =====

function BalanceTab() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EmployeeResponse | null>(null);
  const year = new Date().getUTCFullYear();

  const { data: employees } = useQuery({
    queryKey: queryKeys.employees.list({ search }),
    queryFn: () => {
      const qs = new URLSearchParams({ limit: '10' });
      if (search) qs.set('search', search);
      return api.get<CursorPaginated<EmployeeResponse>>(`/employees?${qs.toString()}`);
    },
  });

  const { data: balance, isLoading } = useQuery({
    queryKey: queryKeys.leave.balanceOf(selected?.id ?? '', year),
    queryFn: () =>
      api.get<LeaveBalanceResponse[]>(`/leave/balance/${selected?.id}?year=${year}`),
    enabled: selected !== null,
  });

  const [adjustType, setAdjustType] = useState<LeaveBalanceResponse | null>(null);

  return (
    <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Chọn nhân viên</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            placeholder="Tìm theo tên / mã…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {(employees?.items ?? []).map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => setSelected(emp)}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  selected?.id === emp.id ? 'bg-accent' : 'hover:bg-accent/60'
                }`}
              >
                <div className="font-medium">{emp.fullName}</div>
                <div className="text-xs text-muted-foreground">
                  {emp.code}
                  {emp.orgUnitName ? ` · ${emp.orgUnitName}` : ''}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {selected ? `Số dư ${selected.fullName} — ${year}` : 'Số dư phép'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selected ? (
            <p className="text-sm text-muted-foreground">
              Chọn nhân viên để xem &amp; điều chỉnh số dư phép.
            </p>
          ) : isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loại phép</TableHead>
                  <TableHead>Cấp</TableHead>
                  <TableHead>Đã dùng</TableHead>
                  <TableHead>Chờ duyệt</TableHead>
                  <TableHead>Khả dụng</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(balance ?? []).map((b) => (
                  <TableRow key={b.leaveTypeId}>
                    <TableCell className="font-medium">{b.leaveTypeName}</TableCell>
                    <TableCell>{fmtDays(b.accrued)}</TableCell>
                    <TableCell>{fmtDays(b.used)}</TableCell>
                    <TableCell>{fmtDays(b.pending)}</TableCell>
                    <TableCell className="font-semibold">{fmtDays(b.available)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAdjustType(b)}
                      >
                        <SlidersHorizontal className="size-3.5" /> Điều chỉnh
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected && (
        <AdjustDialog
          employee={selected}
          balanceType={adjustType}
          year={year}
          onClose={() => setAdjustType(null)}
        />
      )}
    </div>
  );
}

function AdjustDialog({
  employee,
  balanceType,
  year,
  onClose,
}: {
  employee: EmployeeResponse;
  balanceType: LeaveBalanceResponse | null;
  year: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('1');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/leave/adjust', {
        employeeId: employee.id,
        leaveTypeId: balanceType?.leaveTypeId,
        year,
        amount: Number(amount),
        reason,
      }),
    onSuccess: () => {
      toast.success('Đã điều chỉnh số dư');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.leave.balanceOf(employee.id, year),
      });
      setReason('');
      setAmount('1');
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Điều chỉnh thất bại'),
  });

  return (
    <Dialog open={balanceType !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Điều chỉnh {balanceType?.leaveTypeName}</DialogTitle>
          <DialogDescription>
            {employee.fullName} — năm {year}. Số dương để cộng, số âm để trừ.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="adj-amount">Số ngày (+/−)</Label>
            <Input
              id="adj-amount"
              type="number"
              step="0.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="adj-reason">Lý do</Label>
            <Input
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Thưởng phép, sửa số dư đầu kỳ…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            disabled={mutation.isPending || !reason.trim() || !amount}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Đang lưu…' : 'Điều chỉnh'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
