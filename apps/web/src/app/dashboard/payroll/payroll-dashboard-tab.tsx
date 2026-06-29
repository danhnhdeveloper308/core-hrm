'use client';

import {
  type CursorPaginated,
  type PayrollRunResponse,
} from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Receipt, ShieldCheck, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

const money = (v: number): string => new Intl.NumberFormat('vi-VN').format(v) + '₫';
const compact = (v: number): string =>
  new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(v);

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Banknote;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PayrollDashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.payroll.runs({ pick: 'dashboard' }),
    queryFn: () =>
      api.get<CursorPaginated<PayrollRunResponse>>('/payroll/runs?limit=12'),
  });
  const runs = data?.items ?? [];
  const withData = runs.filter((r) => r.payslipCount > 0);
  const latest = withData[0];

  const chartData = [...withData]
    .reverse()
    .map((r) => ({
      month: r.month.slice(5),
      'Tổng quỹ': r.totalGross,
      'Thực chi': r.totalNet,
    }));

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
        <Banknote className="size-8 opacity-40" />
        Chưa có kỳ lương nào được tính. Tạo & tính kỳ lương ở tab “Kỳ lương”.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Kỳ gần nhất: <span className="font-medium">{latest.month}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng quỹ lương" value={money(latest.totalGross)} icon={Banknote} />
        <StatCard
          label="Bảo hiểm bắt buộc"
          value={money(latest.totalInsurance)}
          icon={ShieldCheck}
        />
        <StatCard label="Thuế TNCN" value={money(latest.totalPit)} icon={Receipt} />
        <StatCard label="Số phiếu lương" value={String(latest.payslipCount)} icon={Users} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tổng quỹ lương theo tháng</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Chưa đủ dữ liệu.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis tickFormatter={compact} fontSize={12} width={56} />
                  <Tooltip formatter={(v: unknown) => money(Number(v))} />
                  <Legend />
                  <Bar dataKey="Tổng quỹ" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Thực chi" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
