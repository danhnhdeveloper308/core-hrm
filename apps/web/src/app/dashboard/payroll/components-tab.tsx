'use client';

import {
  PERMISSIONS,
  type CreateSalaryComponentInput,
  type CursorPaginated,
  type SalaryComponentKind,
  type SalaryComponentResponse,
} from '@repo/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PermissionGate } from '@/components/permission-gate';
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

const KIND_LABEL: Record<SalaryComponentKind, string> = {
  EARNING: 'Cộng (phụ cấp)',
  DEDUCTION: 'Trừ (khấu trừ)',
};

interface CompDraft {
  id: string | null;
  code: string;
  name: string;
  kind: SalaryComponentKind;
  taxable: boolean;
  insurance: boolean;
  defaultAmount: string;
  order: string;
}

function emptyDraft(): CompDraft {
  return {
    id: null,
    code: '',
    name: '',
    kind: 'EARNING',
    taxable: true,
    insurance: false,
    defaultAmount: '',
    order: '0',
  };
}

function toDraft(c: SalaryComponentResponse): CompDraft {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    kind: c.kind,
    taxable: c.taxable,
    insurance: c.insurance,
    defaultAmount: c.defaultAmount !== null ? String(c.defaultAmount) : '',
    order: String(c.order),
  };
}

export function ComponentsTab() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CompDraft | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.payroll.components({}),
    queryFn: () =>
      api.get<CursorPaginated<SalaryComponentResponse>>(
        '/salary-components?limit=200',
      ),
  });
  const rows = data?.items ?? [];

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['payroll', 'components'] });

  const saveMutation = useMutation({
    mutationFn: (d: CompDraft) => {
      const common = {
        name: d.name.trim(),
        kind: d.kind,
        taxable: d.taxable,
        insurance: d.insurance,
        defaultAmount: d.defaultAmount ? Number(d.defaultAmount) : undefined,
        order: Number(d.order) || 0,
      };
      if (d.id) {
        return api.patch<SalaryComponentResponse>(
          `/salary-components/${d.id}`,
          common,
        );
      }
      const body: CreateSalaryComponentInput = {
        code: d.code.trim().toUpperCase(),
        ...common,
      };
      return api.post<SalaryComponentResponse>('/salary-components', body);
    },
    onSuccess: () => {
      void invalidate();
      setDraft(null);
      toast.success('Đã lưu cấu phần');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/salary-components/${id}`),
    onSuccess: () => {
      void invalidate();
      toast.success('Đã xoá');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Xoá thất bại'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Phụ cấp / khấu trừ dùng khi lập lương nhân viên.
        </p>
        <PermissionGate permission={PERMISSIONS.PAYROLL_MANAGE}>
          <Button onClick={() => setDraft(emptyDraft())}>
            <Plus className="size-4" /> Thêm cấu phần
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
              <Coins className="size-8 opacity-40" />
              Chưa có cấu phần lương nào.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã</TableHead>
                    <TableHead>Tên</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Thuế</TableHead>
                    <TableHead>BH</TableHead>
                    <TableHead className="text-right">Mặc định</TableHead>
                    <PermissionGate permission={PERMISSIONS.PAYROLL_MANAGE}>
                      <TableHead className="w-20" />
                    </PermissionGate>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.code}</TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-sm">
                        {KIND_LABEL[c.kind]}
                      </TableCell>
                      <TableCell>
                        {c.taxable ? (
                          <Badge variant="secondary">Chịu thuế</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.insurance ? (
                          <Badge variant="secondary">Tính BH</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.defaultAmount !== null
                          ? new Intl.NumberFormat('vi-VN').format(c.defaultAmount)
                          : '—'}
                      </TableCell>
                      <PermissionGate permission={PERMISSIONS.PAYROLL_MANAGE}>
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
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? 'Sửa cấu phần' : 'Thêm cấu phần lương'}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Mã</Label>
                  <Input
                    value={draft.code}
                    disabled={Boolean(draft.id)}
                    onChange={(e) =>
                      setDraft({ ...draft, code: e.target.value.toUpperCase() })
                    }
                    placeholder="PHU_CAP_AN"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Loại</Label>
                  <Select
                    value={draft.kind}
                    onValueChange={(v) =>
                      setDraft({ ...draft, kind: v as SalaryComponentKind })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(KIND_LABEL) as SalaryComponentKind[]).map(
                        (k) => (
                          <SelectItem key={k} value={k}>
                            {KIND_LABEL[k]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Tên</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Phụ cấp ăn trưa"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Số tiền mặc định</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.defaultAmount}
                    onChange={(e) =>
                      setDraft({ ...draft, defaultAmount: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Thứ tự</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.order}
                    onChange={(e) =>
                      setDraft({ ...draft, order: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.taxable}
                    onCheckedChange={(v) =>
                      setDraft({ ...draft, taxable: Boolean(v) })
                    }
                  />
                  Chịu thuế TNCN
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.insurance}
                    onCheckedChange={(v) =>
                      setDraft({ ...draft, insurance: Boolean(v) })
                    }
                  />
                  Tính vào lương đóng BH
                </label>
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
                !draft.code.trim() ||
                !draft.name.trim() ||
                saveMutation.isPending
              }
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
