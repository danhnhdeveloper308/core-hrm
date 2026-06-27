'use client';

import {
  PERMISSIONS,
  type CreateKpiDefinitionInput,
  type CursorPaginated,
  type KpiDefinitionResponse,
  type KpiDirection,
} from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Gauge, Pencil, Plus, Trash2 } from 'lucide-react';
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

const DIRECTION_LABEL: Record<KpiDirection, string> = {
  HIGHER_BETTER: 'Cao hơn = tốt',
  LOWER_BETTER: 'Thấp hơn = tốt',
};

interface KpiDraft {
  id: string | null;
  name: string;
  category: string;
  unit: string;
  direction: KpiDirection;
  defaultWeight: string;
  description: string;
}

function emptyDraft(): KpiDraft {
  return {
    id: null,
    name: '',
    category: '',
    unit: '',
    direction: 'HIGHER_BETTER',
    defaultWeight: '0',
    description: '',
  };
}

function toDraft(k: KpiDefinitionResponse): KpiDraft {
  return {
    id: k.id,
    name: k.name,
    category: k.category ?? '',
    unit: k.unit ?? '',
    direction: k.direction,
    defaultWeight: String(k.defaultWeight),
    description: k.description ?? '',
  };
}

export function KpiTab() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<KpiDraft | null>(null);

  const filters = {};
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: queryKeys.performance.kpiDefinitions(filters),
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '100' });
        if (pageParam) params.set('cursor', pageParam);
        return api.get<CursorPaginated<KpiDefinitionResponse>>(
          `/kpi-definitions?${params.toString()}`,
        );
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['performance', 'kpi-definitions'] });

  const saveMutation = useMutation({
    mutationFn: (d: KpiDraft) => {
      const body: CreateKpiDefinitionInput = {
        name: d.name.trim(),
        category: d.category.trim() || undefined,
        unit: d.unit.trim() || undefined,
        direction: d.direction,
        defaultWeight: Number(d.defaultWeight) || 0,
        description: d.description.trim() || undefined,
      };
      return d.id
        ? api.patch<KpiDefinitionResponse>(`/kpi-definitions/${d.id}`, body)
        : api.post<KpiDefinitionResponse>('/kpi-definitions', body);
    },
    onSuccess: () => {
      void invalidate();
      setDraft(null);
      toast.success('Đã lưu KPI');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lưu KPI thất bại'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/kpi-definitions/${id}`),
    onSuccess: () => {
      void invalidate();
      toast.success('Đã xoá KPI');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Xoá thất bại'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Thư viện KPI dùng lại khi giao mục tiêu.
        </p>
        <PermissionGate permission={PERMISSIONS.PERFORMANCE_MANAGE}>
          <Button onClick={() => setDraft(emptyDraft())}>
            <Plus className="size-4" /> Thêm KPI
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
              <Gauge className="size-8 opacity-40" />
              Chưa có KPI nào trong thư viện.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên KPI</TableHead>
                    <TableHead>Nhóm</TableHead>
                    <TableHead>Đơn vị</TableHead>
                    <TableHead>Chiều tốt</TableHead>
                    <TableHead className="text-right">Trọng số</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <PermissionGate permission={PERMISSIONS.PERFORMANCE_MANAGE}>
                      <TableHead className="w-20" />
                    </PermissionGate>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {k.category ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {k.unit ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {DIRECTION_LABEL[k.direction]}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {k.defaultWeight}%
                      </TableCell>
                      <TableCell>
                        {k.active ? (
                          <Badge
                            variant="secondary"
                            className="bg-green-500/15 text-green-600 dark:text-green-400"
                          >
                            Đang dùng
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-muted text-muted-foreground">
                            Ẩn
                          </Badge>
                        )}
                      </TableCell>
                      <PermissionGate permission={PERMISSIONS.PERFORMANCE_MANAGE}>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Sửa"
                              onClick={() => setDraft(toDraft(k))}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Xoá"
                              onClick={() => removeMutation.mutate(k.id)}
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
            <DialogTitle>{draft?.id ? 'Sửa KPI' : 'Thêm KPI'}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Tên KPI</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Doanh số, Tỷ lệ lỗi, eNPS…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Nhóm</Label>
                  <Input
                    value={draft.category}
                    onChange={(e) =>
                      setDraft({ ...draft, category: e.target.value })
                    }
                    placeholder="Kinh doanh, Chất lượng…"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Đơn vị tính</Label>
                  <Input
                    value={draft.unit}
                    onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                    placeholder="%, đồng, điểm…"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Chiều tốt</Label>
                  <Select
                    value={draft.direction}
                    onValueChange={(v) =>
                      setDraft({ ...draft, direction: v as KpiDirection })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(DIRECTION_LABEL) as KpiDirection[]).map(
                        (d) => (
                          <SelectItem key={d} value={d}>
                            {DIRECTION_LABEL[d]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Trọng số gợi ý (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.defaultWeight}
                    onChange={(e) =>
                      setDraft({ ...draft, defaultWeight: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Mô tả</Label>
                <Input
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  placeholder="Cách đo, công thức…"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Huỷ
            </Button>
            <Button
              disabled={!draft || !draft.name.trim() || saveMutation.isPending}
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
