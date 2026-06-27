'use client';

import {
  type CursorPaginated,
  type GoalStatus,
  type PerformanceDashboard,
  type ReviewCycleResponse,
} from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Star, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

const PIE_COLORS = [
  '#16a34a',
  '#2563eb',
  '#f59e0b',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
];

const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  DRAFT: 'Nháp',
  ACTIVE: 'Đang chạy',
  DONE: 'Hoàn thành',
  CANCELLED: 'Đã huỷ',
};

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Star;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardTab() {
  const [cycleId, setCycleId] = useState<string>('');

  const { data: cyclesPage } = useQuery({
    queryKey: queryKeys.performance.cycles({ pick: 'dashboard' }),
    queryFn: () =>
      api.get<CursorPaginated<ReviewCycleResponse>>('/review-cycles?limit=50'),
  });
  const cycles = cyclesPage?.items ?? [];
  const activeCycle = cycleId || cycles[0]?.id || '';

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.performance.dashboard(activeCycle),
    queryFn: () =>
      api.get<PerformanceDashboard>(
        `/performance-reports/dashboard?cycleId=${activeCycle}`,
      ),
    enabled: Boolean(activeCycle),
  });

  if (cycles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
        <BarChart3 className="size-8 opacity-40" />
        Chưa có chu kỳ đánh giá. Tạo chu kỳ ở tab “Chu kỳ” trước.
      </div>
    );
  }

  const goalData =
    data?.goalByStatus.map((g) => ({
      name: GOAL_STATUS_LABEL[g.status],
      count: g.count,
    })) ?? [];

  return (
    <div className="space-y-4">
      <Select value={activeCycle} onValueChange={setCycleId}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Chọn chu kỳ" />
        </SelectTrigger>
        <SelectContent>
          {cycles.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Điểm chốt trung bình"
              value={data.summary.avgFinalScore !== null ? `${data.summary.avgFinalScore}/5` : '—'}
              icon={Star}
            />
            <StatCard
              label="Đánh giá hoàn tất"
              value={`${data.summary.reviewDone}/${data.summary.reviewTotal}`}
              icon={TrendingUp}
            />
            <StatCard
              label="Tiến độ mục tiêu TB"
              value={
                data.summary.avgGoalProgress !== null
                  ? `${data.summary.avgGoalProgress}%`
                  : '—'
              }
              icon={Target}
            />
            <StatCard
              label="Tổng mục tiêu"
              value={String(data.summary.goalTotal)}
              icon={BarChart3}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Điểm chốt theo đơn vị
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.scoreByUnit.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Chưa có đánh giá nào được chốt.
                  </p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.scoreByUnit}
                        layout="vertical"
                        margin={{ left: 8, right: 16 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" domain={[0, 5]} fontSize={12} />
                        <YAxis
                          type="category"
                          dataKey="unitName"
                          width={120}
                          fontSize={12}
                        />
                        <Tooltip />
                        <Bar
                          dataKey="avgScore"
                          name="Điểm TB"
                          fill="#2563eb"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Phân phối xếp loại</CardTitle>
              </CardHeader>
              <CardContent>
                {data.ratingDistribution.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Chưa có dữ liệu xếp loại.
                  </p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.ratingDistribution}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={(e) => {
                            const p = e as { name?: string; value?: number };
                            return `${p.name ?? ''}: ${p.value ?? ''}`;
                          }}
                        >
                          {data.ratingDistribution.map((_, i) => (
                            <Cell
                              key={i}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Mục tiêu theo trạng thái</CardTitle>
              </CardHeader>
              <CardContent>
                {goalData.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Chưa có mục tiêu nào trong chu kỳ.
                  </p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={goalData} margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={12} />
                        <YAxis allowDecimals={false} fontSize={12} />
                        <Tooltip />
                        <Bar
                          dataKey="count"
                          name="Số mục tiêu"
                          fill="#16a34a"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
