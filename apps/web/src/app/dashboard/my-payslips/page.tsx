'use client';

import {
  PERMISSIONS,
  type CursorPaginated,
  type PayslipResponse,
} from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { useState } from 'react';
import { PermissionGate } from '@/components/permission-gate';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { PayslipBreakdown } from '../payroll/payslip-breakdown';

const money = (v: number): string => new Intl.NumberFormat('vi-VN').format(v) + '₫';

export default function MyPayslipsPage() {
  const [detail, setDetail] = useState<PayslipResponse | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.payroll.myPayslips,
    queryFn: () =>
      api.get<CursorPaginated<PayslipResponse>>('/payslips/mine?limit=60'),
  });
  const rows = data?.items ?? [];

  return (
    <PermissionGate
      permission={PERMISSIONS.PAYSLIP_READ_SELF}
      fallback={
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền xem phiếu lương.
        </p>
      }
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Phiếu lương của tôi</h1>
          <p className="text-sm text-muted-foreground">
            Phiếu lương các kỳ đã được duyệt / chi.
          </p>
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
                <Receipt className="size-8 opacity-40" />
                Chưa có phiếu lương nào.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tháng</TableHead>
                      <TableHead className="text-right">Tổng thu nhập</TableHead>
                      <TableHead className="text-right">Khấu trừ</TableHead>
                      <TableHead className="text-right">Thực lĩnh</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.month ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(p.grossEarnings)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {money(p.insuranceTotal + p.pit + p.otherDeductions)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {money(p.netPay)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setDetail(p)}>
                            Chi tiết
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Phiếu lương tháng {detail?.month}</DialogTitle>
            </DialogHeader>
            {detail ? <PayslipBreakdown p={detail} /> : null}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDetail(null)}>
                Đóng
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGate>
  );
}
