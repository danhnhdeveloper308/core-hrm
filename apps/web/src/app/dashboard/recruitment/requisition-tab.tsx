'use client';

import {
  PERMISSIONS,
  type ContractType,
  type CursorPaginated,
  type JobRequisitionResponse,
  type OrgUnitResponse,
  type PositionResponse,
  type RequisitionStatus,
} from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Briefcase, Pencil, Plus } from 'lucide-react';
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
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

const STATUS_META: Record<RequisitionStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Nháp', cls: 'bg-muted text-muted-foreground' },
  OPEN: { label: 'Đang mở', cls: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  ON_HOLD: { label: 'Tạm dừng', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  CLOSED: { label: 'Đã đóng', cls: 'bg-muted text-muted-foreground' },
  FILLED: { label: 'Đã tuyển đủ', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
};

const EMP_TYPE_LABELS: Record<ContractType, string> = {
  PROBATION: 'Thử việc',
  FIXED_TERM: 'Xác định thời hạn',
  INDEFINITE: 'Không xác định',
  SEASONAL: 'Thời vụ',
  SERVICE: 'Dịch vụ',
  APPRENTICESHIP: 'Học việc',
};

const ALL_STATUSES = Object.keys(STATUS_META) as RequisitionStatus[];
const ALL_TYPES = Object.keys(EMP_TYPE_LABELS) as ContractType[];

function salaryRange(from: number | null, to: number | null): string {
  const f = (v: number) => new Intl.NumberFormat('vi-VN').format(v);
  if (from && to) return `${f(from)} – ${f(to)}₫`;
  if (from) return `từ ${f(from)}₫`;
  if (to) return `đến ${f(to)}₫`;
  return '—';
}

interface ReqDraft {
  id: string | null;
  title: string;
  orgUnitId: string | null;
  positionId: string;
  headcount: string;
  salaryFrom: string;
  salaryTo: string;
  employmentType: ContractType | 'NONE';
  status: RequisitionStatus;
  description: string;
  requirements: string;
}

function emptyDraft(): ReqDraft {
  return {
    id: null,
    title: '',
    orgUnitId: null,
    positionId: '',
    headcount: '1',
    salaryFrom: '',
    salaryTo: '',
    employmentType: 'NONE',
    status: 'DRAFT',
    description: '',
    requirements: '',
  };
}

export function RequisitionTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RequisitionStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<ReqDraft | null>(null);

  const { data: units = [] } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
  });
  const { data: positions = [] } = useQuery({
    queryKey: queryKeys.org.positions,
    queryFn: () => api.get<PositionResponse[]>('/positions'),
  });

  const filters = { status, search };
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: queryKeys.recruitment.jobRequisitions(filters),
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '20' });
        if (pageParam) params.set('cursor', pageParam);
        if (status !== 'ALL') params.set('status', status);
        if (search.trim()) params.set('search', search.trim());
        return api.get<CursorPaginated<JobRequisitionResponse>>(
          `/job-requisitions?${params.toString()}`,
        );
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['recruitment', 'job-requisitions'] });

  const saveMutation = useMutation({
    mutationFn: (d: ReqDraft) => {
      const body = {
        title: d.title.trim(),
        orgUnitId: d.orgUnitId ?? null,
        positionId: d.positionId || null,
        headcount: Number(d.headcount),
        salaryFrom: d.salaryFrom ? Number(d.salaryFrom) : null,
        salaryTo: d.salaryTo ? Number(d.salaryTo) : null,
        employmentType: d.employmentType === 'NONE' ? null : d.employmentType,
        status: d.status,
        description: d.description.trim() || null,
        requirements: d.requirements.trim() || null,
      };
      return d.id
        ? api.patch<JobRequisitionResponse>(`/job-requisitions/${d.id}`, body)
        : api.post<JobRequisitionResponse>('/job-requisitions', body);
    },
    onSuccess: () => {
      void invalidate();
      setDraft(null);
      toast.success('Đã lưu tin tuyển dụng');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RequisitionStatus }) =>
      api.patch<JobRequisitionResponse>(`/job-requisitions/${id}`, { status }),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Đổi trạng thái thất bại'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Tìm tiêu đề…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as RequisitionStatus | 'ALL')}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <PermissionGate permission={PERMISSIONS.RECRUITMENT_MANAGE}>
          <Button onClick={() => setDraft(emptyDraft())}>
            <Plus className="size-4" /> Tạo tin
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
              <Briefcase className="size-8 opacity-40" />
              Chưa có tin tuyển dụng nào.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tiêu đề</TableHead>
                    <TableHead>Đơn vị / Chức danh</TableHead>
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead>Lương</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <PermissionGate permission={PERMISSIONS.RECRUITMENT_MANAGE}>
                      <TableHead className="w-40" />
                    </PermissionGate>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.title}</TableCell>
                      <TableCell className="text-sm">
                        <div>{r.orgUnitName ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.positionName ?? '—'}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.headcount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {salaryRange(r.salaryFrom, r.salaryTo)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_META[r.status].cls}>
                          {STATUS_META[r.status].label}
                        </Badge>
                      </TableCell>
                      <PermissionGate permission={PERMISSIONS.RECRUITMENT_MANAGE}>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            {r.status === 'DRAFT' || r.status === 'ON_HOLD' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => statusMutation.mutate({ id: r.id, status: 'OPEN' })}
                              >
                                Mở
                              </Button>
                            ) : r.status === 'OPEN' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => statusMutation.mutate({ id: r.id, status: 'CLOSED' })}
                              >
                                Đóng
                              </Button>
                            ) : null}
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Sửa"
                              onClick={() =>
                                setDraft({
                                  id: r.id,
                                  title: r.title,
                                  orgUnitId: r.orgUnitId,
                                  positionId: r.positionId ?? '',
                                  headcount: String(r.headcount),
                                  salaryFrom: r.salaryFrom?.toString() ?? '',
                                  salaryTo: r.salaryTo?.toString() ?? '',
                                  employmentType: r.employmentType ?? 'NONE',
                                  status: r.status,
                                  description: r.description ?? '',
                                  requirements: r.requirements ?? '',
                                })
                              }
                            >
                              <Pencil className="size-4" />
                            </Button>
                          </div>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Sửa tin tuyển dụng' : 'Tạo tin tuyển dụng'}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Tiêu đề</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Nhân viên kinh doanh khu vực HCM"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Đơn vị</Label>
                <OrgUnitCascader
                  units={units}
                  value={draft.orgUnitId}
                  onChange={(id) => setDraft({ ...draft, orgUnitId: id })}
                />
              </div>
              <div className="space-y-1">
                <Label>Chức danh</Label>
                <Select value={draft.positionId} onValueChange={(v) => setDraft({ ...draft, positionId: v })}>
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
                <Label>Số lượng cần</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.headcount}
                  onChange={(e) => setDraft({ ...draft, headcount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Lương từ (VND)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.salaryFrom}
                  onChange={(e) => setDraft({ ...draft, salaryFrom: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Lương đến (VND)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.salaryTo}
                  onChange={(e) => setDraft({ ...draft, salaryTo: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Loại hợp đồng</Label>
                <Select
                  value={draft.employmentType}
                  onValueChange={(v) => setDraft({ ...draft, employmentType: v as ContractType | 'NONE' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— Không rõ —</SelectItem>
                    {ALL_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {EMP_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Trạng thái</Label>
                <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as RequisitionStatus })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Mô tả công việc</Label>
                <Input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Yêu cầu ứng viên</Label>
                <Input
                  value={draft.requirements}
                  onChange={(e) => setDraft({ ...draft, requirements: e.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Huỷ
            </Button>
            <Button
              disabled={!draft || !draft.title.trim() || saveMutation.isPending}
              onClick={() => draft && saveMutation.mutate(draft)}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
