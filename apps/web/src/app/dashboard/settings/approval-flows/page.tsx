'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createApprovalFlowSchema,
  type ApprovalFlowResponse,
  type ApprovalFlowStepResponse,
  type ApproverType,
  type CreateApprovalFlowInput,
  type OrgUnitResponse,
  type OrgUnitTypeResponse,
  type Paginated,
  type RoleResponse,
  type UserResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  GitBranch,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
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
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { TARGET_TYPE_LABELS } from '../../leave/shared';

const TARGET_TYPES: { value: string; label: string }[] = [
  { value: 'LEAVE', label: 'Nghỉ phép' },
  { value: 'ATTENDANCE_CORRECTION', label: 'Điều chỉnh công' },
  { value: 'OT', label: 'Tăng ca' },
];

const APPROVER_TYPE_OPTIONS: { value: ApproverType; label: string }[] = [
  { value: 'DIRECT_MANAGER', label: 'Quản lý trực tiếp' },
  { value: 'MANAGEMENT_CHAIN', label: 'Cấp quản lý thứ N' },
  { value: 'UNIT_MANAGER_OF_TYPE', label: 'Quản lý đơn vị (theo loại)' },
  { value: 'UNIT_MANAGER_OF_UNIT', label: 'Quản lý đơn vị (chọn cụ thể)' },
  { value: 'ROLE', label: 'Vai trò' },
  { value: 'SPECIFIC_USER', label: 'Người chỉ định' },
];

function stepSummary(step: ApprovalFlowStepResponse): string {
  switch (step.approverType) {
    case 'DIRECT_MANAGER':
      return 'Quản lý trực tiếp';
    case 'MANAGEMENT_CHAIN':
      return `Quản lý cấp ${step.chainLevel ?? '?'}`;
    case 'UNIT_MANAGER_OF_TYPE':
      return `Quản lý đơn vị: ${step.unitTypeCode ?? '?'}`;
    case 'UNIT_MANAGER_OF_UNIT':
      return `Quản lý: ${step.orgUnitName ?? '?'}`;
    case 'ROLE':
      return `Vai trò: ${step.roleName ?? '?'}`;
    case 'SPECIFIC_USER':
      return `Người: ${step.userName ?? '?'}`;
    default:
      return step.approverType;
  }
}

export default function ApprovalFlowsPage() {
  const queryClient = useQueryClient();
  const [targetType, setTargetType] = useState('LEAVE');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApprovalFlowResponse | null>(null);

  const { data: flows, isLoading } = useQuery({
    queryKey: queryKeys.approval.flows(targetType),
    queryFn: () =>
      api.get<ApprovalFlowResponse[]>(`/approval-flows?targetType=${targetType}`),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['approval', 'flows'] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(`/approval-flows/${id}`),
    onSuccess: () => {
      toast.success('Đã xoá luồng duyệt');
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
  });

  return (
    <FadeIn className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Luồng duyệt</h1>
          <p className="text-muted-foreground">
            Định nghĩa chuỗi người duyệt N cấp theo cây tổ chức cho từng loại đơn
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={targetType} onValueChange={setTargetType}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGET_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Tạo luồng
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (flows ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border py-16 text-muted-foreground">
          <GitBranch className="size-8" />
          <p>
            Chưa có luồng duyệt cho {TARGET_TYPE_LABELS[targetType]}. Đơn sẽ không gửi
            được tới khi tạo luồng.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(flows ?? []).map((flow) => (
            <Card key={flow.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    {flow.name}
                    {!flow.active && <Badge variant="outline">tắt</Badge>}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => {
                        setEditTarget(flow);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive"
                      onClick={() => deleteMutation.mutate(flow.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">ưu tiên {flow.priority}</Badge>
                  {flow.conditions?.totalDays != null && (
                    <Badge variant="outline">
                      khi tổng ngày ≥{' '}
                      {String(
                        (flow.conditions.totalDays as { gte?: number })?.gte ?? '?',
                      )}
                    </Badge>
                  )}
                  {!flow.conditions && <Badge variant="outline">mặc định</Badge>}
                </div>
                <ol className="space-y-1">
                  {flow.steps.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="flex size-5 items-center justify-center rounded-full bg-muted text-xs">
                        {s.order}
                      </span>
                      {stepSummary(s)}
                      {s.slaHours && (
                        <span className="text-xs text-muted-foreground">
                          (SLA {s.slaHours}h)
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <FlowFormDialog
        open={formOpen}
        target={editTarget}
        targetType={targetType}
        onClose={() => setFormOpen(false)}
        onSaved={() => void invalidate()}
      />
    </FadeIn>
  );
}

// ===== Form builder =====

function FlowFormDialog({
  open,
  target,
  targetType,
  onClose,
  onSaved,
}: {
  open: boolean;
  target: ApprovalFlowResponse | null;
  targetType: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target !== null;
  const [minDays, setMinDays] = useState('');

  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.all,
    queryFn: () => api.get<Paginated<RoleResponse>>('/roles?limit=100'),
    enabled: open,
  });
  const { data: users } = useQuery({
    queryKey: queryKeys.users.all,
    queryFn: () => api.get<Paginated<UserResponse>>('/users?limit=100'),
    enabled: open,
  });
  const { data: unitTypes } = useQuery({
    queryKey: queryKeys.org.unitTypes,
    queryFn: () => api.get<OrgUnitTypeResponse[]>('/org-unit-types'),
    enabled: open,
  });
  const { data: orgUnits } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
    enabled: open,
  });

  const form = useForm<
    z.input<typeof createApprovalFlowSchema>,
    unknown,
    CreateApprovalFlowInput
  >({
    resolver: zodResolver(createApprovalFlowSchema),
    defaultValues: {
      targetType: 'LEAVE',
      name: '',
      priority: 0,
      active: true,
      steps: [{ approverType: 'DIRECT_MANAGER' }],
    },
  });

  // Reset khi mở dialog theo target
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (target?.id ?? `new-${targetType}`) : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      const cond = target?.conditions?.totalDays as { gte?: number } | undefined;
      setMinDays(cond?.gte != null ? String(cond.gte) : '');
      form.reset({
        targetType: (target?.targetType ?? targetType) as CreateApprovalFlowInput['targetType'],
        name: target?.name ?? '',
        priority: target?.priority ?? 0,
        active: target?.active ?? true,
        steps:
          target?.steps.map((s) => ({
            approverType: s.approverType,
            chainLevel: s.chainLevel ?? undefined,
            unitTypeCode: s.unitTypeCode ?? undefined,
            orgUnitId: s.orgUnitId ?? undefined,
            roleId: s.roleId ?? undefined,
            userId: s.userId ?? undefined,
            slaHours: s.slaHours ?? undefined,
            label: s.label ?? undefined,
          })) ?? [{ approverType: 'DIRECT_MANAGER' }],
      });
    }
  }

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'steps',
  });

  const mutation = useMutation({
    mutationFn: (values: CreateApprovalFlowInput) => {
      const payload = {
        ...values,
        conditions: minDays ? { totalDays: { gte: Number(minDays) } } : null,
      };
      return isEdit
        ? api.patch<ApprovalFlowResponse>(`/approval-flows/${target.id}`, payload)
        : api.post<ApprovalFlowResponse>('/approval-flows', payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Đã cập nhật luồng' : 'Đã tạo luồng duyệt');
      onSaved();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Lưu thất bại'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Sửa luồng duyệt' : 'Tạo luồng duyệt'}</DialogTitle>
          <DialogDescription>
            Các bước duyệt tuần tự. Bước rỗng (không có ai) sẽ tự bỏ qua. Bất kỳ ai
            trong một bước duyệt là qua bước đó.
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên luồng</FormLabel>
                    <FormControl>
                      <Input placeholder="Duyệt nghỉ phép nhà máy" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="targetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loại đơn</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isEdit}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TARGET_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ưu tiên</FormLabel>
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
              <div className="space-y-1">
                <Label className="text-sm">Áp dụng khi tổng ngày ≥</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="(mặc định)"
                  value={minDays}
                  onChange={(e) => setMinDays(e.target.value)}
                />
              </div>
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 pt-7">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Kích hoạt</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Các bước duyệt</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => append({ approverType: 'DIRECT_MANAGER' })}
                >
                  <Plus className="size-3.5" /> Thêm bước
                </Button>
              </div>

              {fields.map((field, index) => (
                <StepRow
                  key={field.id}
                  index={index}
                  total={fields.length}
                  form={form}
                  roles={roles?.items ?? []}
                  users={users?.items ?? []}
                  unitTypes={unitTypes ?? []}
                  orgUnits={orgUnits ?? []}
                  onRemove={() => remove(index)}
                  onUp={() => move(index, index - 1)}
                  onDown={() => move(index, index + 1)}
                />
              ))}
              {form.formState.errors.steps?.message && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.steps.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Đang lưu…' : 'Lưu luồng'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type FlowForm = ReturnType<
  typeof useForm<z.input<typeof createApprovalFlowSchema>, unknown, CreateApprovalFlowInput>
>;

function StepRow({
  index,
  total,
  form,
  roles,
  users,
  unitTypes,
  orgUnits,
  onRemove,
  onUp,
  onDown,
}: {
  index: number;
  total: number;
  form: FlowForm;
  roles: RoleResponse[];
  users: UserResponse[];
  unitTypes: OrgUnitTypeResponse[];
  orgUnits: OrgUnitResponse[];
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const approverType = form.watch(`steps.${index}.approverType`);

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold">
          {index + 1}
        </span>
        <FormField
          control={form.control}
          name={`steps.${index}.approverType`}
          render={({ field }) => (
            <FormItem className="flex-1">
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {APPROVER_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={index === 0}
          onClick={onUp}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={index === total - 1}
          onClick={onDown}
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 text-destructive"
          onClick={onRemove}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3 pl-8">
        {approverType === 'MANAGEMENT_CHAIN' && (
          <FormField
            control={form.control}
            name={`steps.${index}.chainLevel`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Cấp quản lý (N)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? e.target.valueAsNumber : undefined,
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {approverType === 'UNIT_MANAGER_OF_TYPE' && (
          <FormField
            control={form.control}
            name={`steps.${index}.unitTypeCode`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Loại đơn vị</FormLabel>
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Chọn loại đơn vị" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {unitTypes.map((t) => (
                      <SelectItem key={t.id} value={t.code}>
                        {t.name} ({t.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {approverType === 'UNIT_MANAGER_OF_UNIT' && (
          <FormField
            control={form.control}
            name={`steps.${index}.orgUnitId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Đơn vị cụ thể</FormLabel>
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Chọn đơn vị" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {orgUnits.map((u) => (
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
        )}
        {approverType === 'ROLE' && (
          <FormField
            control={form.control}
            name={`steps.${index}.roleId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Vai trò</FormLabel>
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Chọn vai trò" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {approverType === 'SPECIFIC_USER' && (
          <FormField
            control={form.control}
            name={`steps.${index}.userId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Người duyệt</FormLabel>
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Chọn người" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name={`steps.${index}.label`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Nhãn chữ ký (vd DUYỆT, GĐNM)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || undefined)}
                  placeholder="(theo loại duyệt)"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`steps.${index}.slaHours`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">SLA (giờ, tuỳ chọn)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value ? e.target.valueAsNumber : undefined)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
