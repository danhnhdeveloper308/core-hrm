'use client';

import {
  PERMISSIONS,
  type CreateReviewCycleInput,
  type CursorPaginated,
  type ReviewCycleResponse,
  type ReviewCycleStatus,
  type ReviewCycleType,
} from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { CalendarRange, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { GoalsTab } from './goals-tab';
import { KpiTab } from './kpi-tab';
import { ReviewsTab } from './reviews-tab';

const TYPE_LABEL: Record<ReviewCycleType, string> = {
  QUARTERLY: 'Theo quý',
  SEMI: 'Nửa năm',
  ANNUAL: 'Cả năm',
  CUSTOM: 'Tuỳ chỉnh',
};

const STATUS_META: Record<ReviewCycleStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Nháp', cls: 'bg-muted text-muted-foreground' },
  OPEN: {
    label: 'Đang mở',
    cls: 'bg-green-500/15 text-green-600 dark:text-green-400',
  },
  CALIBRATING: {
    label: 'Hiệu chỉnh',
    cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  CLOSED: {
    label: 'Đã đóng',
    cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
};

interface CycleDraft {
  id: string | null;
  name: string;
  type: ReviewCycleType;
  periodStart: string;
  periodEnd: string;
  status: ReviewCycleStatus;
}

function emptyDraft(): CycleDraft {
  return {
    id: null,
    name: '',
    type: 'QUARTERLY',
    periodStart: '',
    periodEnd: '',
    status: 'DRAFT',
  };
}

function toDraft(c: ReviewCycleResponse): CycleDraft {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
    status: c.status,
  };
}

function CyclesTab() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CycleDraft | null>(null);

  const filters = {};
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: queryKeys.performance.cycles(filters),
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '50' });
        if (pageParam) params.set('cursor', pageParam);
        return api.get<CursorPaginated<ReviewCycleResponse>>(
          `/review-cycles?${params.toString()}`,
        );
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['performance', 'cycles'] });

  const saveMutation = useMutation({
    mutationFn: (d: CycleDraft) => {
      if (d.id) {
        return api.patch<ReviewCycleResponse>(`/review-cycles/${d.id}`, {
          name: d.name.trim(),
          type: d.type,
          periodStart: d.periodStart,
          periodEnd: d.periodEnd,
          status: d.status,
        });
      }
      const body: CreateReviewCycleInput = {
        name: d.name.trim(),
        type: d.type,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
      };
      return api.post<ReviewCycleResponse>('/review-cycles', body);
    },
    onSuccess: () => {
      void invalidate();
      setDraft(null);
      toast.success('Đã lưu chu kỳ');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lưu chu kỳ thất bại'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/review-cycles/${id}`),
    onSuccess: () => {
      void invalidate();
      toast.success('Đã xoá chu kỳ');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Xoá thất bại'),
  });

  const valid = (d: CycleDraft | null): d is CycleDraft =>
    !!d && !!d.name.trim() && !!d.periodStart && !!d.periodEnd;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Khung thời gian cho mục tiêu, đánh giá và 360°.
        </p>
        <PermissionGate permission={PERMISSIONS.PERFORMANCE_MANAGE}>
          <Button onClick={() => setDraft(emptyDraft())}>
            <Plus className="size-4" /> Tạo chu kỳ
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
              <CalendarRange className="size-8 opacity-40" />
              Chưa có chu kỳ đánh giá nào.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên chu kỳ</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Thời gian</TableHead>
                    <TableHead className="text-right">Mục tiêu</TableHead>
                    <TableHead className="text-right">Đánh giá</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <PermissionGate permission={PERMISSIONS.PERFORMANCE_MANAGE}>
                      <TableHead className="w-20" />
                    </PermissionGate>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {TYPE_LABEL[c.type]}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.periodStart} → {c.periodEnd}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.goalCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.reviewCount}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={STATUS_META[c.status].cls}
                        >
                          {STATUS_META[c.status].label}
                        </Badge>
                      </TableCell>
                      <PermissionGate permission={PERMISSIONS.PERFORMANCE_MANAGE}>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Sửa"
                              onClick={() => setDraft(toDraft(c))}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            {c.status === 'DRAFT' ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Xoá"
                                onClick={() => removeMutation.mutate(c.id)}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </PermissionGate>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? 'Sửa chu kỳ' : 'Tạo chu kỳ đánh giá'}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Tên chu kỳ</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Q3/2026, Đánh giá năm 2026…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Loại</Label>
                  <Select
                    value={draft.type}
                    onValueChange={(v) =>
                      setDraft({ ...draft, type: v as ReviewCycleType })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_LABEL) as ReviewCycleType[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {draft.id ? (
                  <div className="space-y-1">
                    <Label>Trạng thái</Label>
                    <Select
                      value={draft.status}
                      onValueChange={(v) =>
                        setDraft({ ...draft, status: v as ReviewCycleStatus })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_META) as ReviewCycleStatus[]).map(
                          (s) => (
                            <SelectItem key={s} value={s}>
                              {STATUS_META[s].label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Từ ngày</Label>
                  <Input
                    type="date"
                    value={draft.periodStart}
                    onChange={(e) =>
                      setDraft({ ...draft, periodStart: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Đến ngày</Label>
                  <Input
                    type="date"
                    value={draft.periodEnd}
                    onChange={(e) =>
                      setDraft({ ...draft, periodEnd: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Huỷ
            </Button>
            <Button
              disabled={!valid(draft) || saveMutation.isPending}
              onClick={() => valid(draft) && saveMutation.mutate(draft)}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PerformancePage() {
  return (
    <PermissionGate
      permission={PERMISSIONS.PERFORMANCE_READ}
      fallback={
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền xem hiệu suất.
        </p>
      }
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Hiệu suất</h1>
          <p className="text-sm text-muted-foreground">
            Chu kỳ đánh giá, thư viện KPI, mục tiêu, đánh giá và 360°.
          </p>
        </div>

        <Tabs defaultValue="cycles">
          <TabsList>
            <TabsTrigger value="cycles">Chu kỳ</TabsTrigger>
            <TabsTrigger value="goals">Mục tiêu</TabsTrigger>
            <TabsTrigger value="reviews">Đánh giá</TabsTrigger>
            <TabsTrigger value="kpi">Thư viện KPI</TabsTrigger>
          </TabsList>
          <TabsContent value="cycles" className="mt-4">
            <CyclesTab />
          </TabsContent>
          <TabsContent value="goals" className="mt-4">
            <GoalsTab />
          </TabsContent>
          <TabsContent value="reviews" className="mt-4">
            <ReviewsTab />
          </TabsContent>
          <TabsContent value="kpi" className="mt-4">
            <KpiTab />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  );
}
