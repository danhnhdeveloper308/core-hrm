'use client';

import {
  PERMISSIONS,
  type CursorPaginated,
  type PayrollRunResponse,
  type PayrollRunStatus,
  type PayslipResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, CalendarPlus, Eye, RefreshCw, Trash2 } from 'lucide-react';
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
import { PayslipBreakdown } from './payslip-breakdown';

const money = (v: number): string => new Intl.NumberFormat('vi-VN').format(v) + '₫';

const STATUS_META: Record<PayrollRunStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Nháp', cls: 'bg-muted text-muted-foreground' },
  CALCULATED: {
    label: 'Đã tính',
    cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  PENDING_APPROVAL: {
    label: 'Chờ duyệt',
    cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  APPROVED: {
    label: 'Đã duyệt',
    cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  },
  PAID: {
    label: 'Đã chi',
    cls: 'bg-green-500/15 text-green-600 dark:text-green-400',
  },
};

export function RunsTab() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [month, setMonth] = useState('');
  const [viewRun, setViewRun] = useState<PayrollRunResponse | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.payroll.runs({}),
    queryFn: () =>
      api.get<CursorPaginated<PayrollRunResponse>>('/payroll/runs?limit=50'),
  });
  const rows = data?.items ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['payroll', 'runs'] });

  const createMutation = useMutation({
    mutationFn: (m: string) =>
      api.post<PayrollRunResponse>('/payroll/runs', { month: m }),
    onSuccess: () => {
      invalidate();
      setCreating(false);
      setMonth('');
      toast.success('Đã tạo kỳ lương');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Tạo kỳ thất bại'),
  });

  const action = useMutation({
    mutationFn: ({ id, op }: { id: string; op: string }) =>
      op === 'delete'
        ? api.delete(`/payroll/runs/${id}`)
        : api.post<PayrollRunResponse>(`/payroll/runs/${id}/${op}`),
    onSuccess: (_r, vars) => {
      invalidate();
      if (vars.op === 'calculate') {
        toast.success('Đang tính lương… (làm mới sau giây lát)');
        setTimeout(() => void invalidate(), 2500);
      } else {
        toast.success('Đã cập nhật kỳ lương');
      }
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Thao tác thất bại'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Tạo kỳ → tính lương → duyệt → chốt chi (khoá kỳ).
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label="Làm mới" onClick={() => invalidate()}>
            <RefreshCw className="size-4" />
          </Button>
          <PermissionGate permission={PERMISSIONS.PAYROLL_MANAGE}>
            <Button onClick={() => setCreating(true)}>
              <CalendarPlus className="size-4" /> Tạo kỳ
            </Button>
          </PermissionGate>
        </div>
      </div>

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
              <Calculator className="size-8 opacity-40" />
              Chưa có kỳ lương nào.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tháng</TableHead>
                    <TableHead className="text-right">Số phiếu</TableHead>
                    <TableHead className="text-right">Tổng quỹ</TableHead>
                    <TableHead className="text-right">Thực chi</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="w-72" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.month}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.payslipCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(r.totalGross)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(r.totalNet)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_META[r.status].cls}>
                          {STATUS_META[r.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          {r.payslipCount > 0 ? (
                            <Button size="sm" variant="outline" onClick={() => setViewRun(r)}>
                              <Eye className="size-4" /> Bảng lương
                            </Button>
                          ) : null}
                          <PermissionGate permission={PERMISSIONS.PAYROLL_MANAGE}>
                            {r.status === 'DRAFT' || r.status === 'CALCULATED' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={action.isPending}
                                onClick={() => action.mutate({ id: r.id, op: 'calculate' })}
                              >
                                {r.status === 'DRAFT' ? 'Tính lương' : 'Tính lại'}
                              </Button>
                            ) : null}
                            {r.status === 'CALCULATED' ? (
                              <Button
                                size="sm"
                                disabled={action.isPending}
                                onClick={() => action.mutate({ id: r.id, op: 'submit' })}
                              >
                                Gửi duyệt
                              </Button>
                            ) : null}
                            {r.status === 'APPROVED' ? (
                              <Button
                                size="sm"
                                disabled={action.isPending}
                                onClick={() => action.mutate({ id: r.id, op: 'pay' })}
                              >
                                Chốt chi
                              </Button>
                            ) : null}
                            {r.status === 'DRAFT' || r.status === 'CALCULATED' ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Xoá"
                                disabled={action.isPending}
                                onClick={() => action.mutate({ id: r.id, op: 'delete' })}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            ) : null}
                          </PermissionGate>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tạo kỳ */}
      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tạo kỳ lương</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Tháng</Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Huỷ
            </Button>
            <Button
              disabled={!month || createMutation.isPending}
              onClick={() => createMutation.mutate(month)}
            >
              Tạo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewRun ? (
        <RunPayslipsDialog run={viewRun} onClose={() => setViewRun(null)} />
      ) : null}
    </div>
  );
}

function RunPayslipsDialog({
  run,
  onClose,
}: {
  run: PayrollRunResponse;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<PayslipResponse | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.payroll.runPayslips(run.id),
    queryFn: () =>
      api.get<CursorPaginated<PayslipResponse>>(
        `/payroll/runs/${run.id}/payslips?limit=500`,
      ),
  });
  const rows = data?.items ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bảng lương tháng {run.month}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nhân viên</TableHead>
                  <TableHead className="text-right">Tổng TN</TableHead>
                  <TableHead className="text-right">BH</TableHead>
                  <TableHead className="text-right">TNCN</TableHead>
                  <TableHead className="text-right">Thực lĩnh</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.employeeName ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(p.grossEarnings)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {money(p.insuranceTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {money(p.pit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {money(p.netPay)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Chi tiết"
                        onClick={() => setDetail(p)}
                      >
                        <Eye className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Phiếu lương — {detail?.employeeName}</DialogTitle>
          </DialogHeader>
          {detail ? <PayslipBreakdown p={detail} /> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetail(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
