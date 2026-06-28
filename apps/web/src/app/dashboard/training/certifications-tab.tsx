'use client';

import {
  PERMISSIONS,
  type CertificationResponse,
  type CertificationStatus,
  type CreateCertificationInput,
  type CursorPaginated,
  type EmployeeResponse,
  type TrainingCourseResponse,
} from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Award, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { useAuthStore } from '@/stores/auth-store';

const STATUS_META: Record<CertificationStatus, { label: string; cls: string }> = {
  VALID: { label: 'Còn hạn', cls: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  EXPIRING: { label: 'Sắp hết hạn', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  EXPIRED: { label: 'Hết hạn', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
};

interface CertDraft {
  id: string | null;
  employeeId: string;
  name: string;
  issuer: string;
  issuedDate: string;
  expiryDate: string;
  credentialId: string;
  trainingCourseId: string;
}

function emptyDraft(): CertDraft {
  return {
    id: null,
    employeeId: '',
    name: '',
    issuer: '',
    issuedDate: '',
    expiryDate: '',
    credentialId: '',
    trainingCourseId: '',
  };
}

function toDraft(c: CertificationResponse): CertDraft {
  return {
    id: c.id,
    employeeId: c.employeeId,
    name: c.name,
    issuer: c.issuer ?? '',
    issuedDate: c.issuedDate,
    expiryDate: c.expiryDate ?? '',
    credentialId: c.credentialId ?? '',
    trainingCourseId: c.trainingCourseId ?? '',
  };
}

export function CertificationsTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canReadEmployees =
    user?.permissions.includes(PERMISSIONS.EMPLOYEE_READ) ?? false;

  const [draft, setDraft] = useState<CertDraft | null>(null);
  const [expiringOnly, setExpiringOnly] = useState(false);

  const { data: employees } = useQuery({
    queryKey: queryKeys.employees.list({ pick: 'cert' }),
    queryFn: () =>
      api.get<CursorPaginated<EmployeeResponse>>('/employees?limit=200'),
    enabled: canReadEmployees && draft !== null,
  });
  const employeeList = employees?.items ?? [];

  const { data: courses } = useQuery({
    queryKey: queryKeys.training.courses({ pick: 'cert' }),
    queryFn: () =>
      api.get<CursorPaginated<TrainingCourseResponse>>(
        '/training/courses?limit=200',
      ),
    enabled: draft !== null,
  });
  const courseList = courses?.items ?? [];

  const filters = { expiringOnly };
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: queryKeys.training.certifications(filters),
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '100' });
        if (pageParam) params.set('cursor', pageParam);
        if (expiringOnly) params.set('expiringInDays', '60');
        return api.get<CursorPaginated<CertificationResponse>>(
          `/certifications?${params.toString()}`,
        );
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['training', 'certifications'] });

  const saveMutation = useMutation({
    mutationFn: (d: CertDraft) => {
      const common = {
        name: d.name.trim(),
        issuer: d.issuer.trim() || undefined,
        issuedDate: d.issuedDate,
        expiryDate: d.expiryDate || undefined,
        credentialId: d.credentialId.trim() || undefined,
        trainingCourseId: d.trainingCourseId || undefined,
      };
      if (d.id) {
        return api.patch<CertificationResponse>(
          `/certifications/${d.id}`,
          common,
        );
      }
      const body: CreateCertificationInput = {
        employeeId: d.employeeId,
        ...common,
      };
      return api.post<CertificationResponse>('/certifications', body);
    },
    onSuccess: () => {
      void invalidate();
      setDraft(null);
      toast.success('Đã lưu chứng chỉ');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lưu chứng chỉ thất bại'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/certifications/${id}`),
    onSuccess: () => {
      void invalidate();
      toast.success('Đã xoá chứng chỉ');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Xoá thất bại'),
  });

  const valid = (d: CertDraft | null): d is CertDraft =>
    !!d && !!d.name.trim() && !!d.issuedDate && (!!d.id || !!d.employeeId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant={expiringOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setExpiringOnly((v) => !v)}
        >
          Sắp hết hạn (60 ngày)
        </Button>
        <PermissionGate permission={PERMISSIONS.TRAINING_MANAGE}>
          <Button onClick={() => setDraft(emptyDraft())}>
            <Plus className="size-4" /> Cấp chứng chỉ
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
              <Award className="size-8 opacity-40" />
              Chưa có chứng chỉ nào.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead>Chứng chỉ</TableHead>
                    <TableHead>Cấp bởi</TableHead>
                    <TableHead>Ngày cấp</TableHead>
                    <TableHead>Hết hạn</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <PermissionGate permission={PERMISSIONS.TRAINING_MANAGE}>
                      <TableHead className="w-20" />
                    </PermissionGate>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.employeeName ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div>{c.name}</div>
                        {c.courseTitle ? (
                          <div className="text-xs text-muted-foreground">
                            {c.courseTitle}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.issuer ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.issuedDate}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.expiryDate ?? '—'}
                        {c.daysToExpiry !== null && c.status !== 'EXPIRED' ? (
                          <span className="text-xs"> ({c.daysToExpiry}d)</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={STATUS_META[c.status].cls}
                        >
                          {STATUS_META[c.status].label}
                        </Badge>
                      </TableCell>
                      <PermissionGate permission={PERMISSIONS.TRAINING_MANAGE}>
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
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Xoá"
                              onClick={() => removeMutation.mutate(c.id)}
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

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? 'Sửa chứng chỉ' : 'Cấp chứng chỉ'}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              {!draft.id && canReadEmployees ? (
                <div className="space-y-1">
                  <Label>Nhân viên</Label>
                  <Select
                    value={draft.employeeId}
                    onValueChange={(v) => setDraft({ ...draft, employeeId: v })}
                  >
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
              ) : null}
              <div className="space-y-1">
                <Label>Tên chứng chỉ</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="An toàn lao động, IELTS 7.0…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Đơn vị cấp</Label>
                  <Input
                    value={draft.issuer}
                    onChange={(e) =>
                      setDraft({ ...draft, issuer: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Mã chứng chỉ</Label>
                  <Input
                    value={draft.credentialId}
                    onChange={(e) =>
                      setDraft({ ...draft, credentialId: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Ngày cấp</Label>
                  <Input
                    type="date"
                    value={draft.issuedDate}
                    onChange={(e) =>
                      setDraft({ ...draft, issuedDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Ngày hết hạn</Label>
                  <Input
                    type="date"
                    value={draft.expiryDate}
                    onChange={(e) =>
                      setDraft({ ...draft, expiryDate: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Khoá đào tạo nguồn (tuỳ chọn)</Label>
                <Select
                  value={draft.trainingCourseId || 'none'}
                  onValueChange={(v) =>
                    setDraft({
                      ...draft,
                      trainingCourseId: v === 'none' ? '' : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Không gắn —</SelectItem>
                    {courseList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
