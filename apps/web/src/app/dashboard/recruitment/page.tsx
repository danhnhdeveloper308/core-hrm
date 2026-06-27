'use client';

import {
  PERMISSIONS,
  type CreateManpowerRequestInput,
  type CursorPaginated,
  type ManpowerRequestResponse,
  type ManpowerRequestStatus,
  type OrgUnitResponse,
  type PositionResponse,
} from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Plus, Users, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { OrgUnitCascader } from '@/components/org/org-unit-cascader';
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

const STATUS_META: Record<ManpowerRequestStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Chờ duyệt', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  APPROVED: { label: 'Đã duyệt', cls: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  REJECTED: { label: 'Từ chối', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  FULFILLED: { label: 'Đã tuyển đủ', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  CANCELLED: { label: 'Đã huỷ', cls: 'bg-muted text-muted-foreground' },
};

function money(v: number | null): string {
  return v === null ? '—' : new Intl.NumberFormat('vi-VN').format(v) + '₫';
}

interface ManpowerDraft {
  orgUnitId: string | null;
  positionId: string;
  quantity: string;
  reason: string;
  neededBy: string;
  budgetSalary: string;
}

function emptyDraft(): ManpowerDraft {
  return { orgUnitId: null, positionId: '', quantity: '1', reason: '', neededBy: '', budgetSalary: '' };
}

function ManpowerTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ManpowerRequestStatus | 'ALL'>('ALL');
  const [draft, setDraft] = useState<ManpowerDraft | null>(null);

  const { data: units = [] } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
  });
  const { data: positions = [] } = useQuery({
    queryKey: queryKeys.org.positions,
    queryFn: () => api.get<PositionResponse[]>('/positions'),
  });

  const filters = { status };
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: queryKeys.recruitment.manpowerRequests(filters),
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '20' });
        if (pageParam) params.set('cursor', pageParam);
        if (status !== 'ALL') params.set('status', status);
        return api.get<CursorPaginated<ManpowerRequestResponse>>(
          `/manpower-requests?${params.toString()}`,
        );
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['recruitment', 'manpower-requests'] });

  const createMutation = useMutation({
    mutationFn: (d: ManpowerDraft) => {
      const body: CreateManpowerRequestInput = {
        orgUnitId: d.orgUnitId ?? undefined,
        positionId: d.positionId || undefined,
        quantity: Number(d.quantity),
        reason: d.reason.trim(),
        neededBy: d.neededBy || undefined,
        budgetSalary: d.budgetSalary ? Number(d.budgetSalary) : undefined,
      };
      return api.post<ManpowerRequestResponse>('/manpower-requests', body);
    },
    onSuccess: () => {
      void invalidate();
      setDraft(null);
      toast.success('Đã gửi yêu cầu tuyển dụng');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Gửi yêu cầu thất bại'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<ManpowerRequestResponse>(`/manpower-requests/${id}/cancel`),
    onSuccess: () => {
      void invalidate();
      toast.success('Đã huỷ yêu cầu');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Huỷ thất bại'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={status} onValueChange={(v) => setStatus(v as ManpowerRequestStatus | 'ALL')}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
            {(Object.keys(STATUS_META) as ManpowerRequestStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <PermissionGate permission={PERMISSIONS.RECRUITMENT_MANAGE}>
          <Button onClick={() => setDraft(emptyDraft())}>
            <Plus className="size-4" /> Tạo yêu cầu
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
              <Users className="size-8 opacity-40" />
              Chưa có yêu cầu tuyển dụng nào.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Người yêu cầu</TableHead>
                    <TableHead>Đơn vị / Chức danh</TableHead>
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead>Cần trước</TableHead>
                    <TableHead className="text-right">Lương dự kiến</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <PermissionGate permission={PERMISSIONS.RECRUITMENT_MANAGE}>
                      <TableHead className="w-12" />
                    </PermissionGate>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.requesterName ?? '—'}</TableCell>
                      <TableCell className="text-sm">
                        <div>{r.orgUnitName ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.positionName ?? '—'}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.neededBy ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.budgetSalary)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_META[r.status].cls}>
                          {STATUS_META[r.status].label}
                        </Badge>
                      </TableCell>
                      <PermissionGate permission={PERMISSIONS.RECRUITMENT_MANAGE}>
                        <TableCell>
                          {r.status === 'PENDING' ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Huỷ"
                              onClick={() => cancelMutation.mutate(r.id)}
                            >
                              <XCircle className="size-4 text-destructive" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </PermissionGate>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {hasNextPage ? (
                <div className="p-3 text-center">
                  <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
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
            <DialogTitle>Tạo yêu cầu tuyển dụng</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Đơn vị</Label>
                <OrgUnitCascader
                  units={units}
                  value={draft.orgUnitId}
                  onChange={(id) => setDraft({ ...draft, orgUnitId: id })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Chức danh</Label>
                  <Select
                    value={draft.positionId}
                    onValueChange={(v) => setDraft({ ...draft, positionId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— Chọn —" />
                    </SelectTrigger>
                    <SelectContent>
                      {positions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Số lượng</Label>
                  <Input
                    type="number"
                    min={1}
                    value={draft.quantity}
                    onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Cần trước ngày</Label>
                  <Input
                    type="date"
                    value={draft.neededBy}
                    onChange={(e) => setDraft({ ...draft, neededBy: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Lương dự kiến (VND)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.budgetSalary}
                    onChange={(e) => setDraft({ ...draft, budgetSalary: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Lý do</Label>
                <Input
                  value={draft.reason}
                  onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                  placeholder="Mở rộng sản xuất, thay người nghỉ việc…"
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
                !draft.reason.trim() ||
                !draft.quantity ||
                createMutation.isPending
              }
              onClick={() => draft && createMutation.mutate(draft)}
            >
              Gửi duyệt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RecruitmentPage() {
  return (
    <PermissionGate
      permission={PERMISSIONS.RECRUITMENT_READ}
      fallback={
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền xem tuyển dụng.
        </p>
      }
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Tuyển dụng</h1>
          <p className="text-sm text-muted-foreground">
            Yêu cầu nhân sự, tin tuyển dụng, ứng viên, phỏng vấn và offer.
          </p>
        </div>

        <Tabs defaultValue="manpower">
          <TabsList>
            <TabsTrigger value="manpower">Yêu cầu nhân sự</TabsTrigger>
          </TabsList>
          <TabsContent value="manpower" className="mt-4">
            <ManpowerTab />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  );
}
