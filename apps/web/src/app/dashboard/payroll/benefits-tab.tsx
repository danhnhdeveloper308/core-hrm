'use client';

import {
  PERMISSIONS,
  type BenefitPlanResponse,
  type CreateBenefitPlanInput,
  type CreateEmployeeBenefitInput,
  type CursorPaginated,
  type EmployeeBenefitResponse,
  type EmployeeResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PermissionGate } from '@/components/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useAuthStore } from '@/stores/auth-store';

const money = (v: number): string => new Intl.NumberFormat('vi-VN').format(v);

interface PlanDraft {
  id: string | null;
  name: string;
  category: string;
  amount: string;
  taxable: boolean;
}

function emptyPlan(): PlanDraft {
  return { id: null, name: '', category: '', amount: '', taxable: false };
}

interface AssignDraft {
  benefitPlanId: string;
  employeeId: string;
  amount: string;
  startDate: string;
  endDate: string;
}

export function BenefitsTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canReadEmployees =
    user?.permissions.includes(PERMISSIONS.EMPLOYEE_READ) ?? false;

  const [plan, setPlan] = useState<PlanDraft | null>(null);
  const [assign, setAssign] = useState<AssignDraft | null>(null);

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: queryKeys.payroll.benefitPlans({}),
    queryFn: () =>
      api.get<CursorPaginated<BenefitPlanResponse>>('/benefits/plans?limit=200'),
  });
  const plans = plansData?.items ?? [];

  const { data: assignData, isLoading: assignLoading } = useQuery({
    queryKey: queryKeys.payroll.benefitAssignments({}),
    queryFn: () =>
      api.get<CursorPaginated<EmployeeBenefitResponse>>(
        '/benefits/assignments?limit=200',
      ),
  });
  const assignments = assignData?.items ?? [];

  const { data: employees } = useQuery({
    queryKey: queryKeys.employees.list({ pick: 'benefit' }),
    queryFn: () =>
      api.get<CursorPaginated<EmployeeResponse>>('/employees?limit=500'),
    enabled: canReadEmployees && assign !== null,
  });
  const employeeList = employees?.items ?? [];

  const savePlan = useMutation({
    mutationFn: (d: PlanDraft) => {
      const common = {
        name: d.name.trim(),
        category: d.category.trim() || undefined,
        amount: Number(d.amount) || 0,
        taxable: d.taxable,
      };
      return d.id
        ? api.patch<BenefitPlanResponse>(`/benefits/plans/${d.id}`, common)
        : api.post<BenefitPlanResponse>('/benefits/plans', {
            ...common,
          } satisfies CreateBenefitPlanInput);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payroll', 'benefit-plans'] });
      setPlan(null);
      toast.success('Đã lưu phúc lợi');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });

  const removePlan = useMutation({
    mutationFn: (id: string) => api.delete(`/benefits/plans/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payroll', 'benefit-plans'] });
      void qc.invalidateQueries({ queryKey: ['payroll', 'benefit-assignments'] });
      toast.success('Đã xoá');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Xoá thất bại'),
  });

  const saveAssign = useMutation({
    mutationFn: (d: AssignDraft) => {
      const body: CreateEmployeeBenefitInput = {
        benefitPlanId: d.benefitPlanId,
        employeeId: d.employeeId,
        amount: d.amount ? Number(d.amount) : undefined,
        startDate: d.startDate || undefined,
        endDate: d.endDate || undefined,
      };
      return api.post<EmployeeBenefitResponse>('/benefits/assignments', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payroll', 'benefit-assignments'] });
      void qc.invalidateQueries({ queryKey: ['payroll', 'benefit-plans'] });
      setAssign(null);
      toast.success('Đã gán phúc lợi');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Gán thất bại'),
  });

  const removeAssign = useMutation({
    mutationFn: (id: string) => api.delete(`/benefits/assignments/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payroll', 'benefit-assignments'] });
      void qc.invalidateQueries({ queryKey: ['payroll', 'benefit-plans'] });
      toast.success('Đã bỏ gán');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Bỏ gán thất bại'),
  });

  return (
    <div className="space-y-6">
      {/* Catalog phúc lợi */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Danh mục phúc lợi</CardTitle>
          <PermissionGate permission={PERMISSIONS.PAYROLL_MANAGE}>
            <Button size="sm" onClick={() => setPlan(emptyPlan())}>
              <Plus className="size-4" /> Thêm
            </Button>
          </PermissionGate>
        </CardHeader>
        <CardContent className="px-0">
          {plansLoading ? (
            <div className="space-y-2 px-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
              <Gift className="size-8 opacity-40" />
              Chưa có phúc lợi nào.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên</TableHead>
                  <TableHead>Nhóm</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead>Thuế</TableHead>
                  <TableHead className="text-right">Đã gán</TableHead>
                  <PermissionGate permission={PERMISSIONS.PAYROLL_MANAGE}>
                    <TableHead className="w-28" />
                  </PermissionGate>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.category ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(p.amount)}
                    </TableCell>
                    <TableCell>
                      {p.taxable ? (
                        <Badge variant="secondary">Chịu thuế</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.assignedCount}
                    </TableCell>
                    <PermissionGate permission={PERMISSIONS.PAYROLL_MANAGE}>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Gán cho NV"
                            onClick={() =>
                              setAssign({
                                benefitPlanId: p.id,
                                employeeId: '',
                                amount: '',
                                startDate: '',
                                endDate: '',
                              })
                            }
                          >
                            <UserPlus className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Sửa"
                            onClick={() =>
                              setPlan({
                                id: p.id,
                                name: p.name,
                                category: p.category ?? '',
                                amount: String(p.amount),
                                taxable: p.taxable,
                              })
                            }
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Xoá"
                            onClick={() => removePlan.mutate(p.id)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </PermissionGate>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Phúc lợi đã gán */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phúc lợi đã gán</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {assignLoading ? (
            <div className="space-y-2 px-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : assignments.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              Chưa gán phúc lợi cho ai.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nhân viên</TableHead>
                  <TableHead>Phúc lợi</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead>Thời hạn</TableHead>
                  <PermissionGate permission={PERMISSIONS.PAYROLL_MANAGE}>
                    <TableHead className="w-12" />
                  </PermissionGate>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.employeeName ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.planName ?? '—'}
                      {a.taxable ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (chịu thuế)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(a.amount)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.startDate ?? '—'}
                      {a.endDate ? ` → ${a.endDate}` : ''}
                    </TableCell>
                    <PermissionGate permission={PERMISSIONS.PAYROLL_MANAGE}>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Bỏ gán"
                          onClick={() => removeAssign.mutate(a.id)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </PermissionGate>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog plan */}
      <Dialog open={plan !== null} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{plan?.id ? 'Sửa phúc lợi' : 'Thêm phúc lợi'}</DialogTitle>
          </DialogHeader>
          {plan ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Tên</Label>
                <Input
                  value={plan.name}
                  onChange={(e) => setPlan({ ...plan, name: e.target.value })}
                  placeholder="Phụ cấp điện thoại, Bảo hiểm sức khoẻ…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Nhóm</Label>
                  <Input
                    value={plan.category}
                    onChange={(e) =>
                      setPlan({ ...plan, category: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Số tiền/tháng</Label>
                  <Input
                    type="number"
                    min={0}
                    value={plan.amount}
                    onChange={(e) => setPlan({ ...plan, amount: e.target.value })}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={plan.taxable}
                  onCheckedChange={(v) => setPlan({ ...plan, taxable: Boolean(v) })}
                />
                Chịu thuế TNCN
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlan(null)}>
              Huỷ
            </Button>
            <Button
              disabled={!plan || !plan.name.trim() || savePlan.isPending}
              onClick={() => plan && savePlan.mutate(plan)}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog assign */}
      <Dialog open={assign !== null} onOpenChange={(o) => !o && setAssign(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gán phúc lợi cho nhân viên</DialogTitle>
          </DialogHeader>
          {assign ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Phúc lợi</Label>
                <Select
                  value={assign.benefitPlanId}
                  onValueChange={(v) =>
                    setAssign({ ...assign, benefitPlanId: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— Chọn —" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nhân viên</Label>
                <Select
                  value={assign.employeeId}
                  onValueChange={(v) => setAssign({ ...assign, employeeId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— Chọn —" />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeList.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.fullName} ({e.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ghi đè số tiền (tuỳ chọn)</Label>
                <Input
                  type="number"
                  min={0}
                  value={assign.amount}
                  onChange={(e) => setAssign({ ...assign, amount: e.target.value })}
                  placeholder="= số tiền của phúc lợi"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Từ ngày</Label>
                  <Input
                    type="date"
                    value={assign.startDate}
                    onChange={(e) =>
                      setAssign({ ...assign, startDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Đến ngày</Label>
                  <Input
                    type="date"
                    value={assign.endDate}
                    onChange={(e) =>
                      setAssign({ ...assign, endDate: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssign(null)}>
              Huỷ
            </Button>
            <Button
              disabled={
                !assign ||
                !assign.benefitPlanId ||
                !assign.employeeId ||
                saveAssign.isPending
              }
              onClick={() => assign && saveAssign.mutate(assign)}
            >
              Gán
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
