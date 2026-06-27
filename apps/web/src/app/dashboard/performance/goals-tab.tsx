'use client';

import {
  PERMISSIONS,
  type CreateGoalInput,
  type CursorPaginated,
  type EmployeeResponse,
  type GoalResponse,
  type GoalStatus,
  type KpiDefinitionResponse,
  type ReviewCycleResponse,
} from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { useAuthStore } from '@/stores/auth-store';

const STATUS_META: Record<GoalStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Nháp', cls: 'bg-muted text-muted-foreground' },
  ACTIVE: {
    label: 'Đang chạy',
    cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  DONE: {
    label: 'Hoàn thành',
    cls: 'bg-green-500/15 text-green-600 dark:text-green-400',
  },
  CANCELLED: { label: 'Đã huỷ', cls: 'bg-muted text-muted-foreground' },
};

interface GoalDraft {
  id: string | null;
  employeeId: string;
  title: string;
  kpiDefinitionId: string;
  target: string;
  unit: string;
  weight: string;
  status: GoalStatus;
}

function emptyDraft(): GoalDraft {
  return {
    id: null,
    employeeId: '',
    title: '',
    kpiDefinitionId: '',
    target: '',
    unit: '',
    weight: '0',
    status: 'DRAFT',
  };
}

function toDraft(g: GoalResponse): GoalDraft {
  return {
    id: g.id,
    employeeId: g.employeeId,
    title: g.title,
    kpiDefinitionId: g.kpiDefinitionId ?? '',
    target: g.target !== null ? String(g.target) : '',
    unit: g.unit ?? '',
    weight: String(g.weight),
    status: g.status,
  };
}

export function GoalsTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canReadEmployees =
    user?.permissions.includes(PERMISSIONS.EMPLOYEE_READ) ?? false;

  const [cycleId, setCycleId] = useState<string>('');
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [progressFor, setProgressFor] = useState<GoalResponse | null>(null);
  const [progressVal, setProgressVal] = useState('0');
  const [actualVal, setActualVal] = useState('');

  const { data: cyclesPage } = useQuery({
    queryKey: queryKeys.performance.cycles({ pick: 'goals' }),
    queryFn: () =>
      api.get<CursorPaginated<ReviewCycleResponse>>('/review-cycles?limit=50'),
  });
  const cycles = cyclesPage?.items ?? [];
  const activeCycle = cycleId || cycles[0]?.id || '';

  const { data: kpis } = useQuery({
    queryKey: queryKeys.performance.kpiDefinitions({ pick: 'goals' }),
    queryFn: () =>
      api.get<CursorPaginated<KpiDefinitionResponse>>(
        '/kpi-definitions?limit=200&active=true',
      ),
  });
  const kpiList = kpis?.items ?? [];

  const { data: employees } = useQuery({
    queryKey: queryKeys.employees.list({ pick: 'goal-assignee' }),
    queryFn: () =>
      api.get<CursorPaginated<EmployeeResponse>>('/employees?limit=200'),
    enabled: canReadEmployees && draft !== null,
  });
  const employeeList = employees?.items ?? [];

  const filters = { cycleId: activeCycle };
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: queryKeys.performance.goals(filters),
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '100' });
        if (activeCycle) params.set('cycleId', activeCycle);
        if (pageParam) params.set('cursor', pageParam);
        return api.get<CursorPaginated<GoalResponse>>(
          `/goals?${params.toString()}`,
        );
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      enabled: Boolean(activeCycle),
    });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['performance', 'goals'] });

  const saveMutation = useMutation({
    mutationFn: (d: GoalDraft) => {
      if (d.id) {
        return api.patch<GoalResponse>(`/goals/${d.id}`, {
          title: d.title.trim(),
          kpiDefinitionId: d.kpiDefinitionId || null,
          target: d.target ? Number(d.target) : null,
          unit: d.unit.trim() || null,
          weight: Number(d.weight) || 0,
          status: d.status,
        });
      }
      const body: CreateGoalInput = {
        employeeId: d.employeeId || undefined,
        cycleId: activeCycle,
        title: d.title.trim(),
        kpiDefinitionId: d.kpiDefinitionId || undefined,
        target: d.target ? Number(d.target) : undefined,
        unit: d.unit.trim() || undefined,
        weight: Number(d.weight) || 0,
      };
      return api.post<GoalResponse>('/goals', body);
    },
    onSuccess: () => {
      void invalidate();
      void qc.invalidateQueries({ queryKey: ['performance', 'cycles'] });
      setDraft(null);
      toast.success('Đã lưu mục tiêu');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lưu mục tiêu thất bại'),
  });

  const progressMutation = useMutation({
    mutationFn: ({ id, progress, actual }: { id: string; progress: number; actual: string }) =>
      api.patch<GoalResponse>(`/goals/${id}/progress`, {
        progress,
        actual: actual ? Number(actual) : null,
      }),
    onSuccess: () => {
      void invalidate();
      setProgressFor(null);
      toast.success('Đã cập nhật tiến độ');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Cập nhật thất bại'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/goals/${id}`),
    onSuccess: () => {
      void invalidate();
      void qc.invalidateQueries({ queryKey: ['performance', 'cycles'] });
      toast.success('Đã xoá mục tiêu');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Xoá thất bại'),
  });

  const openProgress = (g: GoalResponse) => {
    setProgressVal(String(g.progress));
    setActualVal(g.actual !== null ? String(g.actual) : '');
    setProgressFor(g);
  };

  if (cycles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
        <Target className="size-8 opacity-40" />
        Chưa có chu kỳ đánh giá. Tạo chu kỳ ở tab “Chu kỳ” trước.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <Button onClick={() => setDraft(emptyDraft())}>
          <Plus className="size-4" /> Thêm mục tiêu
        </Button>
      </div>

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
              <Target className="size-8 opacity-40" />
              Chưa có mục tiêu nào trong chu kỳ này.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{g.title}</span>
                      <Badge
                        variant="secondary"
                        className={STATUS_META[g.status].cls}
                      >
                        {STATUS_META[g.status].label}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {g.employeeName ?? '—'}
                      {g.kpiName ? ` · KPI: ${g.kpiName}` : ''}
                      {g.target !== null
                        ? ` · Mục tiêu: ${g.target}${g.unit ?? ''}`
                        : ''}
                      {g.weight ? ` · Trọng số ${g.weight}%` : ''}
                    </div>
                  </div>
                  <div className="flex w-40 items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.max(0, Math.min(100, g.progress))}%`,
                        }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                      {g.progress}%
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openProgress(g)}
                    >
                      Tiến độ
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Sửa"
                      onClick={() => setDraft(toDraft(g))}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Xoá"
                      onClick={() => removeMutation.mutate(g.id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {hasNextPage ? (
                <div className="p-3 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                  >
                    {isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tạo / sửa mục tiêu */}
      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? 'Sửa mục tiêu' : 'Thêm mục tiêu'}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              {!draft.id && canReadEmployees ? (
                <div className="space-y-1">
                  <Label>Giao cho</Label>
                  <Select
                    value={draft.employeeId || 'self'}
                    onValueChange={(v) =>
                      setDraft({ ...draft, employeeId: v === 'self' ? '' : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self">Của tôi</SelectItem>
                      {employeeList.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.fullName} ({e.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label>Tên mục tiêu</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Tăng doanh số 20%, Giảm tỷ lệ lỗi…"
                />
              </div>
              <div className="space-y-1">
                <Label>KPI (tuỳ chọn)</Label>
                <Select
                  value={draft.kpiDefinitionId || 'none'}
                  onValueChange={(v) =>
                    setDraft({
                      ...draft,
                      kpiDefinitionId: v === 'none' ? '' : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— Không gắn KPI —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Không gắn KPI —</SelectItem>
                    {kpiList.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Chỉ tiêu</Label>
                  <Input
                    type="number"
                    value={draft.target}
                    onChange={(e) =>
                      setDraft({ ...draft, target: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Đơn vị</Label>
                  <Input
                    value={draft.unit}
                    onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                    placeholder="%, đồng…"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Trọng số %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.weight}
                    onChange={(e) =>
                      setDraft({ ...draft, weight: e.target.value })
                    }
                  />
                </div>
              </div>
              {draft.id ? (
                <div className="space-y-1">
                  <Label>Trạng thái</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(v) =>
                      setDraft({ ...draft, status: v as GoalStatus })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_META) as GoalStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_META[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Huỷ
            </Button>
            <Button
              disabled={
                !draft || !draft.title.trim() || saveMutation.isPending
              }
              onClick={() => draft && saveMutation.mutate(draft)}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cập nhật tiến độ */}
      <Dialog
        open={progressFor !== null}
        onOpenChange={(o) => !o && setProgressFor(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cập nhật tiến độ</DialogTitle>
          </DialogHeader>
          {progressFor ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{progressFor.title}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Thực tế</Label>
                  <Input
                    type="number"
                    value={actualVal}
                    onChange={(e) => setActualVal(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>% hoàn thành</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={progressVal}
                    onChange={(e) => setProgressVal(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProgressFor(null)}>
              Huỷ
            </Button>
            <Button
              disabled={progressMutation.isPending}
              onClick={() =>
                progressFor &&
                progressMutation.mutate({
                  id: progressFor.id,
                  progress: Math.max(0, Math.min(100, Number(progressVal) || 0)),
                  actual: actualVal,
                })
              }
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
