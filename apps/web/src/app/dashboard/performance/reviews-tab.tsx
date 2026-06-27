'use client';

import {
  PERMISSIONS,
  type CursorPaginated,
  type EmployeeResponse,
  type PerformanceReviewResponse,
  type PerformanceReviewStatus,
  type ReviewCycleResponse,
} from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ClipboardList, Sparkles } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const STATUS_META: Record<
  PerformanceReviewStatus,
  { label: string; cls: string }
> = {
  SELF: {
    label: 'Chờ tự đánh giá',
    cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  MANAGER: {
    label: 'Chờ quản lý',
    cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  CALIBRATION: {
    label: 'Chờ ký duyệt',
    cls: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  },
  DONE: {
    label: 'Hoàn tất',
    cls: 'bg-green-500/15 text-green-600 dark:text-green-400',
  },
};

const score = (v: number | null): string => (v === null ? '—' : `${v}/5`);

export function ReviewsTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canConduct =
    user?.permissions.includes(PERMISSIONS.REVIEW_CONDUCT) ?? false;

  const [cycleId, setCycleId] = useState<string>('');
  const [selfFor, setSelfFor] = useState<PerformanceReviewResponse | null>(null);
  const [selfScore, setSelfScore] = useState('');
  const [selfComment, setSelfComment] = useState('');
  const [mgrFor, setMgrFor] = useState<PerformanceReviewResponse | null>(null);
  const [mgrScore, setMgrScore] = useState('');
  const [finalScore, setFinalScore] = useState('');
  const [ratingLabel, setRatingLabel] = useState('');
  const [mgrComment, setMgrComment] = useState('');

  const { data: meEmp } = useQuery({
    queryKey: queryKeys.employees.me,
    queryFn: () => api.get<EmployeeResponse>('/employees/me'),
    retry: false,
  });
  const myEmployeeId = meEmp?.id ?? null;

  const { data: cyclesPage } = useQuery({
    queryKey: queryKeys.performance.cycles({ pick: 'reviews' }),
    queryFn: () =>
      api.get<CursorPaginated<ReviewCycleResponse>>('/review-cycles?limit=50'),
  });
  const cycles = cyclesPage?.items ?? [];
  const activeCycle = cycleId || cycles[0]?.id || '';

  const filters = { cycleId: activeCycle };
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: queryKeys.performance.reviews(filters),
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '100' });
        if (activeCycle) params.set('cycleId', activeCycle);
        if (pageParam) params.set('cursor', pageParam);
        return api.get<CursorPaginated<PerformanceReviewResponse>>(
          `/performance-reviews?${params.toString()}`,
        );
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      enabled: Boolean(activeCycle),
    });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['performance', 'reviews'] });
    void qc.invalidateQueries({ queryKey: ['performance', 'cycles'] });
  };

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post<{ created: number }>('/performance-reviews/generate', {
        cycleId: activeCycle,
      }),
    onSuccess: (r) => {
      invalidate();
      toast.success(`Đã sinh ${r.created} phiếu đánh giá`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Sinh phiếu thất bại'),
  });

  const selfMutation = useMutation({
    mutationFn: () =>
      api.patch<PerformanceReviewResponse>(
        `/performance-reviews/${selfFor!.id}/self`,
        {
          selfScore: Number(selfScore),
          selfComment: selfComment.trim() || null,
        },
      ),
    onSuccess: () => {
      invalidate();
      setSelfFor(null);
      toast.success('Đã gửi tự đánh giá');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Gửi thất bại'),
  });

  const mgrMutation = useMutation({
    mutationFn: () =>
      api.patch<PerformanceReviewResponse>(
        `/performance-reviews/${mgrFor!.id}/manager`,
        {
          managerScore: Number(mgrScore),
          finalScore: Number(finalScore),
          ratingLabel: ratingLabel.trim() || null,
          managerComment: mgrComment.trim() || null,
        },
      ),
    onSuccess: () => {
      invalidate();
      setMgrFor(null);
      toast.success('Đã chốt đánh giá');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Chốt đánh giá thất bại'),
  });

  const openSelf = (r: PerformanceReviewResponse) => {
    setSelfScore(r.selfScore !== null ? String(r.selfScore) : '');
    setSelfComment(r.selfComment ?? '');
    setSelfFor(r);
  };
  const openMgr = (r: PerformanceReviewResponse) => {
    setMgrScore(r.managerScore !== null ? String(r.managerScore) : '');
    setFinalScore(
      r.finalScore !== null
        ? String(r.finalScore)
        : r.selfScore !== null
          ? String(r.selfScore)
          : '',
    );
    setRatingLabel(r.ratingLabel ?? '');
    setMgrComment(r.managerComment ?? '');
    setMgrFor(r);
  };

  if (cycles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
        <ClipboardList className="size-8 opacity-40" />
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
        <PermissionGate permission={PERMISSIONS.PERFORMANCE_MANAGE}>
          <Button
            variant="outline"
            disabled={!activeCycle || generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            <Sparkles className="size-4" /> Sinh phiếu cho chu kỳ
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
              <ClipboardList className="size-8 opacity-40" />
              Chưa có phiếu đánh giá nào trong chu kỳ này.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead>Người đánh giá</TableHead>
                    <TableHead className="text-right">Tự ĐG</TableHead>
                    <TableHead className="text-right">Quản lý</TableHead>
                    <TableHead className="text-right">Chốt</TableHead>
                    <TableHead>Xếp loại</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const canSelf =
                      r.status === 'SELF' && r.employeeId === myEmployeeId;
                    const canMgr = r.status === 'MANAGER' && canConduct;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.employeeName ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.reviewerName ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {score(r.selfScore)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {score(r.managerScore)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {score(r.finalScore)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.ratingLabel ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={STATUS_META[r.status].cls}
                          >
                            {STATUS_META[r.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {canSelf ? (
                            <Button size="sm" onClick={() => openSelf(r)}>
                              Tự đánh giá
                            </Button>
                          ) : canMgr ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openMgr(r)}
                            >
                              Đánh giá
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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

      {/* Tự đánh giá */}
      <Dialog open={selfFor !== null} onOpenChange={(o) => !o && setSelfFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tự đánh giá</DialogTitle>
          </DialogHeader>
          {selfFor ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Điểm tự đánh giá (0–5)</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  step={0.5}
                  value={selfScore}
                  onChange={(e) => setSelfScore(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Nhận xét</Label>
                <Textarea
                  rows={4}
                  value={selfComment}
                  onChange={(e) => setSelfComment(e.target.value)}
                  placeholder="Điểm mạnh, điều cần cải thiện…"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelfFor(null)}>
              Huỷ
            </Button>
            <Button
              disabled={selfScore === '' || selfMutation.isPending}
              onClick={() => selfMutation.mutate()}
            >
              Gửi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quản lý đánh giá */}
      <Dialog open={mgrFor !== null} onOpenChange={(o) => !o && setMgrFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Đánh giá của quản lý</DialogTitle>
          </DialogHeader>
          {mgrFor ? (
            <div className="space-y-3">
              {mgrFor.selfComment ? (
                <div className="rounded-md bg-muted/50 p-2 text-sm">
                  <span className="text-muted-foreground">NV tự nhận xét: </span>
                  {mgrFor.selfComment} ({score(mgrFor.selfScore)})
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Điểm quản lý (0–5)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={mgrScore}
                    onChange={(e) => setMgrScore(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Điểm chốt (0–5)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={finalScore}
                    onChange={(e) => setFinalScore(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Xếp loại</Label>
                <Input
                  value={ratingLabel}
                  onChange={(e) => setRatingLabel(e.target.value)}
                  placeholder="Xuất sắc, Đạt, Cần cải thiện…"
                />
              </div>
              <div className="space-y-1">
                <Label>Nhận xét</Label>
                <Textarea
                  rows={3}
                  value={mgrComment}
                  onChange={(e) => setMgrComment(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMgrFor(null)}>
              Huỷ
            </Button>
            <Button
              disabled={
                mgrScore === '' || finalScore === '' || mgrMutation.isPending
              }
              onClick={() => mgrMutation.mutate()}
            >
              Chốt đánh giá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
