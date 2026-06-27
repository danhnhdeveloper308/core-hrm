'use client';

import {
  PERMISSIONS,
  type OtPolicyResponse,
  type OrgUnitResponse,
  type OvertimeSummary,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { OrgUnitCascader } from '@/components/org/org-unit-cascader';
import { PermissionGate } from '@/components/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { useAuthStore } from '@/stores/auth-store';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ===== Tab Tổng hợp =====

function SummaryTab({ units }: { units: OrgUnitResponse[] }) {
  const [month, setMonth] = useState(currentMonth);
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);

  const filters = { month, orgUnitId };
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.overtime.summary(filters),
    queryFn: () => {
      const params = new URLSearchParams({ month });
      if (orgUnitId) params.set('orgUnitId', orgUnitId);
      return api.get<OvertimeSummary>(`/overtime/summary?${params.toString()}`);
    },
    enabled: /^\d{4}-\d{2}$/.test(month),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="month">Tháng</Label>
            <Input
              id="month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-1 lg:col-span-2">
            <Label>Đơn vị (gồm đơn vị con)</Label>
            <OrgUnitCascader units={units} value={orgUnitId} onChange={setOrgUnitId} />
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <p className="text-sm text-destructive">Không tải được tổng hợp OT.</p>
      ) : isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Tổng giờ OT (tháng)" value={data.totals.monthHours} />
            <KpiCard label="NV có OT" value={data.totals.employees} />
            <KpiCard label="Vượt trần tháng" value={data.totals.overMonth} danger={data.totals.overMonth > 0} />
            <KpiCard label="Vượt trần năm" value={data.totals.overYear} danger={data.totals.overYear > 0} />
          </div>

          <p className="text-xs text-muted-foreground">
            Trần mặc định: {data.caps.maxHoursPerMonth}h/tháng · {data.caps.maxHoursPerYear}h/năm
            (theo luật VN nếu chưa cấu hình). Vượt trần được tô đỏ.
          </p>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Giờ OT theo nhân viên</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {data.rows.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  Không có giờ OT trong tháng đã chọn.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nhân viên</TableHead>
                        <TableHead>Đơn vị</TableHead>
                        <TableHead className="text-right">Giờ tháng</TableHead>
                        <TableHead className="text-right">Giờ năm (YTD)</TableHead>
                        <TableHead className="text-right">Trần T/N</TableHead>
                        <TableHead>Cảnh báo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((r) => (
                        <TableRow key={r.employeeId}>
                          <TableCell>
                            <div className="font-medium">{r.employeeName}</div>
                            <div className="text-xs text-muted-foreground">{r.employeeCode}</div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.orgUnitName ?? '—'}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums ${r.overMonth ? 'font-semibold text-destructive' : ''}`}>
                            {r.monthHours}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums ${r.overYear ? 'font-semibold text-destructive' : ''}`}>
                            {r.yearHours}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                            {r.maxHoursPerMonth}/{r.maxHoursPerYear}
                          </TableCell>
                          <TableCell>
                            {r.overMonth || r.overYear ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="size-3" />
                                {r.overMonth ? 'Vượt tháng' : 'Vượt năm'}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Trong trần</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {data.byUnit.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Giờ OT theo đơn vị (top 12)</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Đơn vị</TableHead>
                        <TableHead className="text-right">Giờ OT</TableHead>
                        <TableHead className="text-right">NV có OT</TableHead>
                        <TableHead className="text-right">Vượt trần</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byUnit.map((u) => (
                        <TableRow key={u.orgUnitId ?? '__none__'}>
                          <TableCell className="font-medium">{u.orgUnitName}</TableCell>
                          <TableCell className="text-right tabular-nums">{u.monthHours}</TableCell>
                          <TableCell className="text-right tabular-nums">{u.employees}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {u.overCount > 0 ? (
                              <span className="font-semibold text-destructive">{u.overCount}</span>
                            ) : (
                              0
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold ${danger ? 'text-destructive' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ===== Tab Trần OT =====

interface PolicyDraft {
  id: string | null;
  orgUnitId: string | null;
  maxHoursPerMonth: string;
  maxHoursPerYear: string;
}

function PolicyTab({ units }: { units: OrgUnitResponse[] }) {
  const qc = useQueryClient();
  const canManage = useAuthStore((s) => s.can(PERMISSIONS.OVERTIME_MANAGE));
  const [draft, setDraft] = useState<PolicyDraft | null>(null);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: queryKeys.overtime.policies,
    queryFn: () => api.get<OtPolicyResponse[]>('/overtime/policies'),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.overtime.policies });
    void qc.invalidateQueries({ queryKey: ['overtime', 'summary'] });
  };

  const saveMutation = useMutation({
    mutationFn: (d: PolicyDraft) => {
      const body = {
        maxHoursPerMonth: Number(d.maxHoursPerMonth),
        maxHoursPerYear: Number(d.maxHoursPerYear),
      };
      return d.id
        ? api.patch<OtPolicyResponse>(`/overtime/policies/${d.id}`, body)
        : api.post<OtPolicyResponse>('/overtime/policies', {
            ...body,
            orgUnitId: d.orgUnitId,
          });
    },
    onSuccess: () => {
      invalidate();
      setDraft(null);
      toast.success('Đã lưu trần OT');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lưu trần OT thất bại'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/overtime/policies/${id}`),
    onSuccess: (r) => {
      invalidate();
      toast.success(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Xoá thất bại'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Trần giờ OT để cảnh báo vượt mức. Bỏ trống đơn vị = trần mặc định toàn tổ chức;
          chọn đơn vị = áp cho đơn vị đó và các đơn vị con.
        </p>
        <PermissionGate permission={PERMISSIONS.OVERTIME_MANAGE}>
          <Button
            size="sm"
            onClick={() =>
              setDraft({ id: null, orgUnitId: null, maxHoursPerMonth: '40', maxHoursPerYear: '200' })
            }
          >
            <Plus className="size-4" /> Thêm trần
          </Button>
        </PermissionGate>
      </div>

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : policies.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Chưa có trần OT — đang dùng mặc định luật VN (40h/tháng · 200h/năm).
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phạm vi</TableHead>
                  <TableHead className="text-right">Trần tháng (h)</TableHead>
                  <TableHead className="text-right">Trần năm (h)</TableHead>
                  {canManage ? <TableHead className="w-24" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.orgUnitName ?? 'Toàn tổ chức (mặc định)'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.maxHoursPerMonth}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.maxHoursPerYear}</TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              setDraft({
                                id: p.id,
                                orgUnitId: p.orgUnitId,
                                maxHoursPerMonth: String(p.maxHoursPerMonth),
                                maxHoursPerYear: String(p.maxHoursPerYear),
                              })
                            }
                            aria-label="Sửa"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(p.id)}
                            aria-label="Xoá"
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Sửa trần OT' : 'Thêm trần OT'}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              {!draft.id ? (
                <div className="space-y-1">
                  <Label>Đơn vị áp dụng (bỏ trống = toàn tổ chức)</Label>
                  <OrgUnitCascader
                    units={units}
                    value={draft.orgUnitId}
                    onChange={(id) => setDraft({ ...draft, orgUnitId: id })}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Phạm vi: {policies.find((p) => p.id === draft.id)?.orgUnitName ?? 'Toàn tổ chức'}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="mh">Trần tháng (giờ)</Label>
                  <Input
                    id="mh"
                    type="number"
                    min={1}
                    value={draft.maxHoursPerMonth}
                    onChange={(e) => setDraft({ ...draft, maxHoursPerMonth: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="yh">Trần năm (giờ)</Label>
                  <Input
                    id="yh"
                    type="number"
                    min={1}
                    value={draft.maxHoursPerYear}
                    onChange={(e) => setDraft({ ...draft, maxHoursPerYear: e.target.value })}
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
              disabled={saveMutation.isPending || !draft?.maxHoursPerMonth || !draft?.maxHoursPerYear}
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

export default function OvertimePage() {
  const { data: units = [] } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
  });

  return (
    <PermissionGate
      permission={PERMISSIONS.ATTENDANCE_READ_ALL}
      fallback={
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền xem quản trị tăng ca.
        </p>
      }
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Quản trị tăng ca (OT)</h1>
          <p className="text-sm text-muted-foreground">
            Tổng hợp giờ tăng ca theo tháng/đơn vị và cảnh báo vượt trần.
          </p>
        </div>

        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Tổng hợp</TabsTrigger>
            <TabsTrigger value="policies">Trần OT</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="mt-4">
            <SummaryTab units={units} />
          </TabsContent>
          <TabsContent value="policies" className="mt-4">
            <PolicyTab units={units} />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  );
}
