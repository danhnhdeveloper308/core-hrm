'use client';

import {
  PERMISSIONS,
  type CreateFeedback360Input,
  type CursorPaginated,
  type EmployeeResponse,
  type Feedback360Detail,
  type Feedback360Invitation,
  type Feedback360Response,
  type Rater360Relation,
  type ReviewCycleResponse,
} from '@repo/shared';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Inbox, Plus, Users, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
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

const RELATION_LABEL: Record<Rater360Relation, string> = {
  MANAGER: 'Quản lý',
  PEER: 'Đồng cấp',
  SUBORDINATE: 'Cấp dưới',
  SELF: 'Bản thân',
};

const score = (v: number | null): string => (v === null ? '—' : `${v}/5`);

interface RaterDraft {
  employeeId: string;
  relation: Rater360Relation;
}

export function Feedback360Tab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canConduct =
    user?.permissions.includes(PERMISSIONS.REVIEW_CONDUCT) ?? false;
  const canReadEmployees =
    user?.permissions.includes(PERMISSIONS.EMPLOYEE_READ) ?? false;

  const [cycleId, setCycleId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [fillFor, setFillFor] = useState<Feedback360Invitation | null>(null);
  const [fillScore, setFillScore] = useState('');
  const [fillComment, setFillComment] = useState('');

  // form tạo đợt
  const [revieweeId, setRevieweeId] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [raters, setRaters] = useState<RaterDraft[]>([]);
  const [newRater, setNewRater] = useState('');
  const [newRelation, setNewRelation] = useState<Rater360Relation>('PEER');

  const { data: invitations = [] } = useQuery({
    queryKey: queryKeys.performance.myInvitations,
    queryFn: () =>
      api.get<Feedback360Invitation[]>('/feedback-360/my-invitations'),
  });

  const { data: cyclesPage } = useQuery({
    queryKey: queryKeys.performance.cycles({ pick: 'f360' }),
    queryFn: () =>
      api.get<CursorPaginated<ReviewCycleResponse>>('/review-cycles?limit=50'),
  });
  const cycles = cyclesPage?.items ?? [];
  const activeCycle = cycleId || cycles[0]?.id || '';

  const { data: employees } = useQuery({
    queryKey: queryKeys.employees.list({ pick: 'f360' }),
    queryFn: () =>
      api.get<CursorPaginated<EmployeeResponse>>('/employees?limit=100'),
    enabled: canReadEmployees && creating,
  });
  const employeeList = employees?.items ?? [];
  const empName = (id: string) =>
    employeeList.find((e) => e.id === id)?.fullName ?? id;

  const { data: sets, isLoading } = useQuery({
    queryKey: queryKeys.performance.feedback360({ cycleId: activeCycle }),
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100' });
      if (activeCycle) params.set('cycleId', activeCycle);
      return api.get<CursorPaginated<Feedback360Response>>(
        `/feedback-360?${params.toString()}`,
      );
    },
    enabled: Boolean(activeCycle),
  });
  const rows = sets?.items ?? [];

  const { data: detail } = useQuery({
    queryKey: detailId
      ? queryKeys.performance.feedback360Detail(detailId)
      : ['performance', 'feedback360', 'detail', 'none'],
    queryFn: () => api.get<Feedback360Detail>(`/feedback-360/${detailId}`),
    enabled: detailId !== null,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['performance', 'feedback360'] });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const body: CreateFeedback360Input = {
        revieweeId,
        cycleId: activeCycle,
        anonymous,
        raters: raters.map((r) => ({
          employeeId: r.employeeId,
          relation: r.relation,
        })),
      };
      return api.post<Feedback360Response>('/feedback-360', body);
    },
    onSuccess: () => {
      invalidate();
      setCreating(false);
      setRevieweeId('');
      setRaters([]);
      toast.success('Đã lập đợt 360°');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lập đợt thất bại'),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<Feedback360Response>(`/feedback-360/${id}/close`),
    onSuccess: () => {
      invalidate();
      toast.success('Đã đóng đợt thu thập');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Đóng thất bại'),
  });

  const fillMutation = useMutation({
    mutationFn: () =>
      api.post<Feedback360Invitation>(
        `/feedback-360/raters/${fillFor!.raterId}/submit`,
        {
          score: Number(fillScore),
          comment: fillComment.trim() || null,
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.performance.myInvitations,
      });
      invalidate();
      setFillFor(null);
      toast.success('Đã gửi phản hồi 360°');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Gửi thất bại'),
  });

  const addRater = () => {
    if (!newRater || raters.some((r) => r.employeeId === newRater)) return;
    setRaters([...raters, { employeeId: newRater, relation: newRelation }]);
    setNewRater('');
  };

  const openFill = (inv: Feedback360Invitation) => {
    setFillScore(inv.score !== null ? String(inv.score) : '');
    setFillComment(inv.comment ?? '');
    setFillFor(inv);
  };

  return (
    <div className="space-y-6">
      {/* Lời mời của tôi */}
      {invitations.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Lời mời đánh giá của tôi</h3>
          <Card>
            <CardContent className="divide-y px-0">
              {invitations.map((inv) => (
                <div
                  key={inv.raterId}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <Inbox className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{inv.revieweeName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {inv.cycleName ?? '—'} · Vai trò:{' '}
                      {RELATION_LABEL[inv.relation]}
                    </div>
                  </div>
                  {inv.submitted ? (
                    <Badge
                      variant="secondary"
                      className="bg-green-500/15 text-green-600 dark:text-green-400"
                    >
                      Đã gửi ({score(inv.score)})
                    </Badge>
                  ) : inv.status === 'CLOSED' ? (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      Đã đóng
                    </Badge>
                  ) : (
                    <Button size="sm" onClick={() => openFill(inv)}>
                      Điền
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Đợt 360° quản lý */}
      <div className="space-y-2">
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
          {canConduct ? (
            <Button
              disabled={!activeCycle || !canReadEmployees}
              onClick={() => setCreating(true)}
            >
              <Plus className="size-4" /> Lập đợt 360°
            </Button>
          ) : null}
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
                <Users className="size-8 opacity-40" />
                Chưa có đợt 360° nào trong chu kỳ này.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nhân viên</TableHead>
                      <TableHead className="text-right">Đã nộp</TableHead>
                      <TableHead className="text-right">Điểm TB</TableHead>
                      <TableHead>Ẩn danh</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="w-32" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">
                          {f.revieweeName ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.submittedCount}/{f.raterCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {score(f.avgScore)}
                        </TableCell>
                        <TableCell>
                          {f.anonymous ? 'Có' : 'Không'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              f.status === 'CLOSED'
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                            }
                          >
                            {f.status === 'CLOSED' ? 'Đã đóng' : 'Đang thu'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDetailId(f.id)}
                            >
                              Xem
                            </Button>
                            {canConduct && f.status === 'COLLECTING' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => closeMutation.mutate(f.id)}
                              >
                                Đóng
                              </Button>
                            ) : null}
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
      </div>

      {/* Dialog điền phản hồi */}
      <Dialog open={fillFor !== null} onOpenChange={(o) => !o && setFillFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Phản hồi 360°</DialogTitle>
          </DialogHeader>
          {fillFor ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Đánh giá {fillFor.revieweeName} ({RELATION_LABEL[fillFor.relation]})
              </p>
              <div className="space-y-1">
                <Label>Điểm (0–5)</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  step={0.5}
                  value={fillScore}
                  onChange={(e) => setFillScore(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Nhận xét</Label>
                <Textarea
                  rows={4}
                  value={fillComment}
                  onChange={(e) => setFillComment(e.target.value)}
                  placeholder="Điểm mạnh, góp ý phát triển…"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFillFor(null)}>
              Huỷ
            </Button>
            <Button
              disabled={fillScore === '' || fillMutation.isPending}
              onClick={() => fillMutation.mutate()}
            >
              Gửi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog tạo đợt */}
      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lập đợt 360°</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nhân viên được đánh giá</Label>
              <Select value={revieweeId} onValueChange={setRevieweeId}>
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
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={anonymous}
                onCheckedChange={(v) => setAnonymous(Boolean(v))}
              />
              Ẩn danh người đánh giá khi tổng hợp
            </label>
            <div className="space-y-2">
              <Label>Người đánh giá</Label>
              <div className="flex flex-wrap gap-2">
                {raters.map((r) => (
                  <Badge key={r.employeeId} variant="secondary" className="gap-1">
                    {empName(r.employeeId)} · {RELATION_LABEL[r.relation]}
                    <button
                      type="button"
                      onClick={() =>
                        setRaters(
                          raters.filter((x) => x.employeeId !== r.employeeId),
                        )
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                {raters.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Chưa thêm người đánh giá nào.
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Select value={newRater} onValueChange={setNewRater}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Chọn người đánh giá" />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeList
                      .filter((e) => !raters.some((r) => r.employeeId === e.id))
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.fullName} ({e.code})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select
                  value={newRelation}
                  onValueChange={(v) => setNewRelation(v as Rater360Relation)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(RELATION_LABEL) as Rater360Relation[]).map(
                      (rel) => (
                        <SelectItem key={rel} value={rel}>
                          {RELATION_LABEL[rel]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={addRater}>
                  Thêm
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Huỷ
            </Button>
            <Button
              disabled={
                !revieweeId || raters.length === 0 || createMutation.isPending
              }
              onClick={() => createMutation.mutate()}
            >
              Lập đợt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog xem tổng hợp */}
      <Dialog
        open={detailId !== null}
        onOpenChange={(o) => !o && setDetailId(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Tổng hợp 360° — {detail?.revieweeName ?? ''}
            </DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <span>
                  Điểm TB:{' '}
                  <span className="font-semibold">{score(detail.avgScore)}</span>
                </span>
                <span className="text-muted-foreground">
                  {detail.submittedCount}/{detail.raterCount} đã nộp
                </span>
                {detail.anonymous ? (
                  <Badge variant="secondary">Ẩn danh</Badge>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label>Theo nhóm quan hệ</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nhóm</TableHead>
                      <TableHead className="text-right">Đã nộp</TableHead>
                      <TableHead className="text-right">Điểm TB</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.byRelation.map((s) => (
                      <TableRow key={s.relation}>
                        <TableCell>{RELATION_LABEL[s.relation]}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.submitted}/{s.count}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {score(s.avgScore)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-1">
                <Label>Nhận xét</Label>
                {detail.comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Chưa có nhận xét.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {detail.comments.map((c, i) => (
                      <li key={i} className="rounded-md bg-muted/50 p-2 text-sm">
                        <span className="text-xs text-muted-foreground">
                          {RELATION_LABEL[c.relation]}
                          {c.raterName ? ` · ${c.raterName}` : ''}
                        </span>
                        <div>{c.comment}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailId(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
