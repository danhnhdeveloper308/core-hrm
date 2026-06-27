'use client';

import {
  PERMISSIONS,
  type AttendanceDashboard,
  type OrgUnitResponse,
} from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  Clock,
  Palmtree,
  Timer,
  TimerOff,
  UserX,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { OrgUnitCascader } from '@/components/org/org-unit-cascader';
import { PermissionGate } from '@/components/permission-gate';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

const COLORS = {
  present: '#16a34a',
  late: '#f59e0b',
  absent: '#ef4444',
  onLeave: '#3b82f6',
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tint,
}: {
  label: string;
  value: number | string;
  icon: typeof CalendarCheck;
  tint: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${tint}1a`, color: tint }}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AttendanceDashboardPage() {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => ymd(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(() => ymd(today));
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);

  const { data: units = [] } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
  });

  const filters = { from, to, orgUnitId };
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.reports.attendanceDashboard(filters),
    queryFn: () => {
      const params = new URLSearchParams({ from, to });
      if (orgUnitId) params.set('orgUnitId', orgUnitId);
      return api.get<AttendanceDashboard>(`/reports/attendance-dashboard?${params.toString()}`);
    },
    enabled: Boolean(from && to),
    placeholderData: (prev) => prev,
  });

  return (
    <PermissionGate
      permission={PERMISSIONS.REPORT_READ}
      fallback={
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền xem dashboard chấm công.
        </p>
      }
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard chấm công</h1>
          <p className="text-sm text-muted-foreground">
            Thống kê chuyên cần theo khoảng thời gian và đơn vị.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="from">Từ ngày</Label>
              <Input
                id="from"
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">Đến ngày</Label>
              <Input
                id="to"
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Đơn vị (gồm đơn vị con)</Label>
              <OrgUnitCascader units={units} value={orgUnitId} onChange={setOrgUnitId} />
            </div>
          </CardContent>
        </Card>

        {isError ? (
          <p className="text-sm text-destructive">Không tải được dữ liệu dashboard.</p>
        ) : isLoading || !data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
            <Skeleton className="h-72 w-full" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Lượt đi làm" value={data.totals.present} icon={CalendarCheck} tint={COLORS.present} />
              <KpiCard label="Lượt đi trễ" value={data.totals.late} icon={Timer} tint={COLORS.late} />
              <KpiCard label="Lượt vắng" value={data.totals.absent} icon={UserX} tint={COLORS.absent} />
              <KpiCard label="Lượt nghỉ phép" value={data.totals.onLeave} icon={Palmtree} tint={COLORS.onLeave} />
              <KpiCard label="Giờ công" value={data.totals.workHours} icon={Clock} tint="#0ea5e9" />
              <KpiCard label="Giờ tăng ca" value={data.totals.otHours} icon={TimerOff} tint="#8b5cf6" />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Diễn biến theo ngày</CardTitle>
              </CardHeader>
              <CardContent>
                {data.series.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Không có dữ liệu trong khoảng đã chọn.
                  </p>
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" fontSize={11} tickMargin={6} />
                        <YAxis fontSize={11} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="present" name="Đi làm" stroke={COLORS.present} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="late" name="Đi trễ" stroke={COLORS.late} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="absent" name="Vắng" stroke={COLORS.absent} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="onLeave" name="Nghỉ phép" stroke={COLORS.onLeave} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Theo đơn vị (top 12)</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.byUnit.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">Chưa có dữ liệu.</p>
                  ) : (
                    <div style={{ height: Math.max(200, data.byUnit.length * 36 + 40) }} className="w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={data.byUnit}
                          margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                          <XAxis type="number" fontSize={11} allowDecimals={false} />
                          <YAxis type="category" dataKey="orgUnitName" width={120} fontSize={11} tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="present" name="Đi làm" fill={COLORS.present} stackId="a" />
                          <Bar dataKey="late" name="Đi trễ" fill={COLORS.late} stackId="a" />
                          <Bar dataKey="absent" name="Vắng" fill={COLORS.absent} stackId="a" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Top đi trễ</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.topLate.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">Không có lượt đi trễ.</p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {data.topLate.map((e) => (
                        <li key={e.employeeId} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{e.employeeName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {e.employeeCode}
                              {e.orgUnitName ? ` · ${e.orgUnitName}` : ''}
                            </p>
                          </div>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: `${COLORS.late}1a`, color: COLORS.late }}
                          >
                            {e.lateCount} lần
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </PermissionGate>
  );
}
