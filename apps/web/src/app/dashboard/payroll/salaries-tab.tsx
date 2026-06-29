'use client';

import {
  PERMISSIONS,
  type CreateEmployeeSalaryInput,
  type CursorPaginated,
  type EmployeeResponse,
  type EmployeeSalaryResponse,
  type SalaryComponentResponse,
  type SalaryLine,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PermissionGate } from '@/components/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

const money = (v: number): string => new Intl.NumberFormat('vi-VN').format(v);

interface SalaryDraft {
  employeeId: string;
  baseSalary: string;
  insuranceSalary: string;
  effectiveDate: string;
  note: string;
  lines: SalaryLine[];
}

function emptyDraft(): SalaryDraft {
  return {
    employeeId: '',
    baseSalary: '',
    insuranceSalary: '',
    effectiveDate: new Date().toISOString().slice(0, 10),
    note: '',
    lines: [],
  };
}

export function SalariesTab() {
  const qc = useQueryClient();

  const [draft, setDraft] = useState<SalaryDraft | null>(null);
  const [pickComp, setPickComp] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.payroll.salaries({}),
    queryFn: () =>
      api.get<CursorPaginated<EmployeeSalaryResponse>>('/employee-salaries'),
  });
  const rows = data?.items ?? [];

  const { data: employees } = useQuery({
    queryKey: queryKeys.employees.list({ pick: 'salary' }),
    queryFn: () =>
      api.get<CursorPaginated<EmployeeResponse>>('/employees?limit=100'),
    enabled: draft !== null,
  });
  const employeeList = employees?.items ?? [];

  const { data: comps } = useQuery({
    queryKey: queryKeys.payroll.components({ pick: 'salary' }),
    queryFn: () =>
      api.get<CursorPaginated<SalaryComponentResponse>>(
        '/salary-components?limit=200&active=true',
      ),
    enabled: draft !== null,
  });
  const compList = comps?.items ?? [];

  const saveMutation = useMutation({
    mutationFn: (d: SalaryDraft) => {
      const body: CreateEmployeeSalaryInput = {
        employeeId: d.employeeId,
        baseSalary: Number(d.baseSalary),
        insuranceSalary: d.insuranceSalary ? Number(d.insuranceSalary) : undefined,
        components: d.lines,
        effectiveDate: d.effectiveDate,
        note: d.note.trim() || undefined,
      };
      return api.post<EmployeeSalaryResponse>('/employee-salaries', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payroll', 'salaries'] });
      setDraft(null);
      toast.success('Đã lưu bản lương');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });

  const addLine = () => {
    if (!draft) return;
    const c = compList.find((x) => x.id === pickComp);
    if (!c || draft.lines.some((l) => l.code === c.code)) return;
    setDraft({
      ...draft,
      lines: [
        ...draft.lines,
        {
          code: c.code,
          name: c.name,
          kind: c.kind,
          taxable: c.taxable,
          insurance: c.insurance,
          amount: c.defaultAmount ?? 0,
        },
      ],
    });
    setPickComp('');
  };

  const setLineAmount = (code: string, amount: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      lines: draft.lines.map((l) => (l.code === code ? { ...l, amount } : l)),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Lương hiện hành mỗi nhân viên (versioned theo ngày hiệu lực).
        </p>
        <PermissionGate permission={PERMISSIONS.PAYROLL_MANAGE}>
          <Button onClick={() => setDraft(emptyDraft())}>
            <Plus className="size-4" /> Lập lương
          </Button>
        </PermissionGate>
      </div>

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
              <Wallet className="size-8 opacity-40" />
              Chưa lập lương cho nhân viên nào.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead className="text-right">Lương cơ bản</TableHead>
                    <TableHead className="text-right">Lương đóng BH</TableHead>
                    <TableHead className="text-right">Phụ cấp/Khấu trừ</TableHead>
                    <TableHead>Hiệu lực</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => {
                    const earn = s.components
                      .filter((l) => l.kind === 'EARNING')
                      .reduce((a, l) => a + l.amount, 0);
                    const ded = s.components
                      .filter((l) => l.kind === 'DEDUCTION')
                      .reduce((a, l) => a + l.amount, 0);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">
                          {s.employeeName ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(s.baseSalary)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {money(s.insuranceSalary ?? s.baseSalary)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          +{money(earn)} / -{money(ded)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.effectiveDate}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lập / cập nhật lương</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nhân viên</Label>
                <Select
                  value={draft.employeeId}
                  onValueChange={(v) => setDraft({ ...draft, employeeId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— Chọn nhân viên —" />
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Lương cơ bản</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.baseSalary}
                    onChange={(e) =>
                      setDraft({ ...draft, baseSalary: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Lương đóng BH (tuỳ chọn)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.insuranceSalary}
                    onChange={(e) =>
                      setDraft({ ...draft, insuranceSalary: e.target.value })
                    }
                    placeholder="= lương cơ bản"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Ngày hiệu lực</Label>
                <Input
                  type="date"
                  value={draft.effectiveDate}
                  onChange={(e) =>
                    setDraft({ ...draft, effectiveDate: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Phụ cấp / khấu trừ</Label>
                {draft.lines.map((l) => (
                  <div key={l.code} className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={
                        l.kind === 'EARNING'
                          ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                          : 'bg-red-500/15 text-red-600 dark:text-red-400'
                      }
                    >
                      {l.kind === 'EARNING' ? '+' : '−'} {l.name}
                    </Badge>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 flex-1"
                      value={l.amount}
                      onChange={(e) =>
                        setLineAmount(l.code, Number(e.target.value) || 0)
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          lines: draft.lines.filter((x) => x.code !== l.code),
                        })
                      }
                    >
                      <X className="size-4 text-muted-foreground" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Select value={pickComp} onValueChange={setPickComp}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Thêm cấu phần…" />
                    </SelectTrigger>
                    <SelectContent>
                      {compList
                        .filter((c) => !draft.lines.some((l) => l.code === c.code))
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!pickComp}
                    onClick={addLine}
                  >
                    Thêm
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Ghi chú</Label>
                <Input
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Huỷ
            </Button>
            <Button
              disabled={
                !draft ||
                !draft.employeeId ||
                !draft.baseSalary ||
                !draft.effectiveDate ||
                saveMutation.isPending
              }
              onClick={() => draft && saveMutation.mutate(draft)}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
