'use client';

import {
  PERMISSIONS,
  type ContractListItem,
  type ContractStatus,
  type ContractType,
  type CursorPaginated,
  type EmployeeResponse,
} from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { FileText, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

const TYPE_LABELS: Record<ContractType, string> = {
  PROBATION: 'Thử việc',
  FIXED_TERM: 'Xác định thời hạn',
  INDEFINITE: 'Không xác định thời hạn',
  SEASONAL: 'Thời vụ',
  SERVICE: 'Dịch vụ',
  APPRENTICESHIP: 'Học việc',
};

const STATUS_META: Record<ContractStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Nháp', cls: 'bg-muted text-muted-foreground' },
  ACTIVE: { label: 'Hiệu lực', cls: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  EXPIRING: { label: 'Sắp hết hạn', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  EXPIRED: { label: 'Hết hạn', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  TERMINATED: { label: 'Đã chấm dứt', cls: 'bg-muted text-muted-foreground line-through' },
};

const ALL_TYPES = Object.keys(TYPE_LABELS) as ContractType[];
const ALL_STATUSES = Object.keys(STATUS_META) as ContractStatus[];

function money(v: number | null): string {
  return v === null ? '—' : new Intl.NumberFormat('vi-VN').format(v) + '₫';
}

interface ContractDraft {
  id: string | null;
  employeeId: string;
  employeeLabel: string;
  type: ContractType;
  code: string;
  startDate: string;
  endDate: string;
  signedDate: string;
  baseSalary: string;
  status: ContractStatus;
  note: string;
}

function emptyDraft(): ContractDraft {
  return {
    id: null,
    employeeId: '',
    employeeLabel: '',
    type: 'FIXED_TERM',
    code: '',
    startDate: '',
    endDate: '',
    signedDate: '',
    baseSalary: '',
    status: 'DRAFT',
    note: '',
  };
}

export default function ContractsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContractStatus | 'ALL'>('ALL');
  const [expiring, setExpiring] = useState(false);
  const [draft, setDraft] = useState<ContractDraft | null>(null);
  const [terminating, setTerminating] = useState<ContractListItem | null>(null);

  const filters = { search, status, expiring };
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useInfiniteQuery({
      queryKey: queryKeys.contracts.list(filters),
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '20' });
        if (pageParam) params.set('cursor', pageParam);
        if (search.trim()) params.set('search', search.trim());
        if (status !== 'ALL') params.set('status', status);
        if (expiring) params.set('expiringInDays', '30');
        return api.get<CursorPaginated<ContractListItem>>(
          `/contracts?${params.toString()}`,
        );
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });

  const contracts = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  const { data: empData } = useQuery({
    queryKey: ['employees', 'picker'],
    queryFn: () => api.get<CursorPaginated<EmployeeResponse>>('/employees?limit=100'),
  });
  const employees = empData?.items ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['contracts'] });

  const saveMutation = useMutation({
    mutationFn: (d: ContractDraft) => {
      const body = {
        type: d.type,
        code: d.code.trim() || null,
        startDate: d.startDate,
        endDate: d.endDate || null,
        signedDate: d.signedDate || null,
        baseSalary: d.baseSalary ? Number(d.baseSalary) : null,
        status: d.status,
        note: d.note.trim() || null,
      };
      return d.id
        ? api.patch<ContractListItem>(`/contracts/${d.id}`, body)
        : api.post<ContractListItem>('/contracts', {
            ...body,
            employeeId: d.employeeId,
          });
    },
    onSuccess: () => {
      void invalidate();
      setDraft(null);
      toast.success('Đã lưu hợp đồng');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lưu hợp đồng thất bại'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/contracts/${id}`),
    onSuccess: (r) => {
      void invalidate();
      toast.success(r.message);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Xoá thất bại'),
  });

  const createDisabled =
    !draft ||
    !draft.startDate ||
    (!draft.id && !draft.employeeId) ||
    saveMutation.isPending;

  return (
    <PermissionGate
      permission={PERMISSIONS.CONTRACT_READ}
      fallback={
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền xem hợp đồng.
        </p>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Hợp đồng lao động</h1>
            <p className="text-sm text-muted-foreground">
              Quản lý hợp đồng, theo dõi hết hạn và chấm dứt.
            </p>
          </div>
          <PermissionGate permission={PERMISSIONS.CONTRACT_MANAGE}>
            <Button onClick={() => setDraft(emptyDraft())}>
              <Plus className="size-4" /> Thêm hợp đồng
            </Button>
          </PermissionGate>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <Input
              placeholder="Tìm số HĐ / tên / mã NV…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={status} onValueChange={(v) => setStatus(v as ContractStatus | 'ALL')}>
              <SelectTrigger className="w-48">
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
            <Button
              variant={expiring ? 'default' : 'outline'}
              size="sm"
              onClick={() => setExpiring((v) => !v)}
            >
              Sắp hết hạn (30 ngày)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-0">
            {isError ? (
              <p className="px-6 py-8 text-center text-sm text-destructive">
                Không tải được danh sách hợp đồng.
              </p>
            ) : isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : contracts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
                <FileText className="size-8 opacity-40" />
                Chưa có hợp đồng nào.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Số HĐ</TableHead>
                      <TableHead>Nhân viên</TableHead>
                      <TableHead>Loại</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Hiệu lực</TableHead>
                      <TableHead className="text-right">Lương cơ bản</TableHead>
                      <PermissionGate permission={PERMISSIONS.CONTRACT_MANAGE}>
                        <TableHead className="w-28" />
                      </PermissionGate>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.code ?? '—'}</TableCell>
                        <TableCell>
                          <div className="font-medium">{c.employeeName}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.employeeCode}
                            {c.orgUnitName ? ` · ${c.orgUnitName}` : ''}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{TYPE_LABELS[c.type]}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_META[c.status].cls}>
                            {STATUS_META[c.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.startDate}
                          {c.endDate ? ` → ${c.endDate}` : ' → (vô thời hạn)'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(c.baseSalary)}
                        </TableCell>
                        <PermissionGate permission={PERMISSIONS.CONTRACT_MANAGE}>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Sửa"
                                onClick={() =>
                                  setDraft({
                                    id: c.id,
                                    employeeId: c.employeeId,
                                    employeeLabel: `${c.employeeName} · ${c.employeeCode}`,
                                    type: c.type,
                                    code: c.code ?? '',
                                    startDate: c.startDate,
                                    endDate: c.endDate ?? '',
                                    signedDate: c.signedDate ?? '',
                                    baseSalary: c.baseSalary?.toString() ?? '',
                                    status: c.status,
                                    note: c.note ?? '',
                                  })
                                }
                              >
                                <Pencil className="size-4" />
                              </Button>
                              {c.status !== 'TERMINATED' ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Chấm dứt"
                                  onClick={() => setTerminating(c)}
                                >
                                  <XCircle className="size-4 text-amber-600" />
                                </Button>
                              ) : null}
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Xoá"
                                onClick={() => deleteMutation.mutate(c.id)}
                              >
                                <Trash2 className="size-4 text-destructive" />
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
      </div>

      {/* Dialog tạo/sửa */}
      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Sửa hợp đồng' : 'Thêm hợp đồng'}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Nhân viên</Label>
                {draft.id ? (
                  <p className="text-sm">{draft.employeeLabel}</p>
                ) : (
                  <Select
                    value={draft.employeeId}
                    onValueChange={(v) => setDraft({ ...draft, employeeId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— Chọn nhân viên —" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.fullName} · {e.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1">
                <Label>Số hợp đồng</Label>
                <Input
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  placeholder="HĐ-2026-001"
                />
              </div>
              <div className="space-y-1">
                <Label>Loại hợp đồng</Label>
                <Select
                  value={draft.type}
                  onValueChange={(v) => setDraft({ ...draft, type: v as ContractType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ngày bắt đầu</Label>
                <Input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Ngày kết thúc (trống = vô thời hạn)</Label>
                <Input
                  type="date"
                  value={draft.endDate}
                  onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Ngày ký</Label>
                <Input
                  type="date"
                  value={draft.signedDate}
                  onChange={(e) => setDraft({ ...draft, signedDate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Lương cơ bản (VND)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.baseSalary}
                  onChange={(e) => setDraft({ ...draft, baseSalary: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Trạng thái</Label>
                <Select
                  value={draft.status}
                  onValueChange={(v) => setDraft({ ...draft, status: v as ContractStatus })}
                >
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
                <Label>Ghi chú</Label>
                <Input
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Huỷ
            </Button>
            <Button
              disabled={createDisabled}
              onClick={() => draft && saveMutation.mutate(draft)}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog chấm dứt */}
      <TerminateDialog
        contract={terminating}
        onClose={() => setTerminating(null)}
        onDone={() => {
          void invalidate();
          setTerminating(null);
        }}
      />
    </PermissionGate>
  );
}

function TerminateDialog({
  contract,
  onClose,
  onDone,
}: {
  contract: ContractListItem | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post<ContractListItem>(`/contracts/${contract!.id}/terminate`, {
        terminateDate: date,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success('Đã chấm dứt hợp đồng');
      setDate('');
      setReason('');
      onDone();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Chấm dứt thất bại'),
  });

  return (
    <Dialog open={contract !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chấm dứt hợp đồng</DialogTitle>
        </DialogHeader>
        {contract ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {contract.employeeName} · {contract.code ?? 'không số'}
            </p>
            <div className="space-y-1">
              <Label>Ngày chấm dứt</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Lý do</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant="destructive"
            disabled={!date || !reason.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Chấm dứt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
