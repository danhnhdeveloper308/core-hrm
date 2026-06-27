'use client';

import { PERMISSIONS, type OrgChartMode, type OrgUnitResponse } from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { OrgChartTree } from '@/components/org/org-chart-tree';
import { OrgUnitCascader } from '@/components/org/org-unit-cascader';
import { PermissionGate } from '@/components/permission-gate';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

export default function OrgChartPage() {
  const [mode, setMode] = useState<OrgChartMode>('unit');
  const [focusUnitId, setFocusUnitId] = useState<string | null>(null);

  // Cần cho cascader + breadcrumb (mode=unit). Cây phẳng ~vài trăm node.
  const { data: units = [] } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
  });

  const breadcrumb = useMemo(() => {
    if (!focusUnitId) return [] as OrgUnitResponse[];
    const byId = new Map(units.map((u) => [u.id, u]));
    const chain: OrgUnitResponse[] = [];
    let cur = byId.get(focusUnitId);
    let guard = 0;
    while (cur && guard++ < 32) {
      chain.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return chain;
  }, [focusUnitId, units]);

  return (
    <PermissionGate
      permission={PERMISSIONS.ORG_READ}
      fallback={
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền xem sơ đồ tổ chức.
        </p>
      }
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Sơ đồ tổ chức</h1>
          <p className="text-sm text-muted-foreground">
            Xem cây tổ chức theo đơn vị hoặc theo tuyến quản lý. Mở từng nhánh để
            tải dữ liệu — tối ưu cho quy mô lớn.
          </p>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as OrgChartMode)}>
          <TabsList>
            <TabsTrigger value="unit">Theo đơn vị</TabsTrigger>
            <TabsTrigger value="people">Theo người</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === 'unit' ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Đơn vị gốc (tuỳ chọn)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <OrgUnitCascader
                units={units}
                value={focusUnitId}
                onChange={setFocusUnitId}
              />
              {breadcrumb.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {breadcrumb.map((u) => u.name).join(' / ')}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="pt-6">
            <OrgChartTree mode={mode} rootId={mode === 'unit' ? focusUnitId : null} />
          </CardContent>
        </Card>
      </div>
    </PermissionGate>
  );
}
