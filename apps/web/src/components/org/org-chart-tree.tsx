'use client';

import type { OrgChartLevel, OrgChartMode, OrgChartNode } from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronRight, Loader2, User, Users } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { cn } from '@/lib/utils';

function levelUrl(mode: OrgChartMode, parentId: string | null): string {
  const params = new URLSearchParams({ mode });
  if (parentId) {
    params.set(mode === 'unit' ? 'rootUnitId' : 'rootEmployeeId', parentId);
  }
  return `/reports/org-chart?${params.toString()}`;
}

function useLevel(mode: OrgChartMode, parentId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reports.orgChart(mode, parentId),
    queryFn: () => api.get<OrgChartLevel>(levelUrl(mode, parentId)),
    enabled,
    staleTime: 60_000,
  });
}

/** 1 node + nhánh con (lazy: chỉ fetch con khi node được mở). */
function NodeRow({ node, mode }: { node: OrgChartNode; mode: OrgChartMode }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useLevel(mode, node.id, expanded && node.hasChildren);
  const Icon = mode === 'unit' ? Building2 : User;

  return (
    <div>
      <div className="group flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent/50">
        <button
          type="button"
          disabled={!node.hasChildren}
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded transition hover:bg-accent',
            !node.hasChildren && 'pointer-events-none opacity-0',
          )}
          aria-label={expanded ? 'Thu gọn' : 'Mở rộng'}
        >
          <ChevronRight
            className={cn('size-4 transition-transform', expanded && 'rotate-90')}
          />
        </button>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{node.name}</span>
            {node.code ? (
              <span className="shrink-0 text-xs text-muted-foreground">· {node.code}</span>
            ) : null}
          </div>
          {node.subtitle || node.meta ? (
            <div className="truncate text-xs text-muted-foreground">
              {[node.subtitle, node.meta].filter(Boolean).join(' · ')}
            </div>
          ) : null}
        </div>
        <Badge variant="secondary" className="shrink-0 gap-1" title="Tổng nhân sự trong nhánh">
          <Users className="size-3" />
          {node.headcount}
        </Badge>
      </div>

      {expanded ? (
        <div className="ml-4 mt-1 space-y-1 border-l pl-3">
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Đang tải…
            </div>
          ) : (
            (data?.nodes ?? []).map((child) => (
              <NodeRow key={child.id} node={child} mode={mode} />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cây sơ đồ tổ chức LAZY: chỉ tải 1 cấp mỗi lần (khi mở nhánh) → chịu được tập
 * đoàn nhiều nghìn node mà không mount toàn bộ. `rootId` = đơn vị/NV gốc cần
 * hiển thị con (null = cấp cao nhất).
 */
export function OrgChartTree({
  mode,
  rootId,
}: {
  mode: OrgChartMode;
  rootId: string | null;
}) {
  const { data, isLoading, isError } = useLevel(mode, rootId, true);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <p className="text-sm text-destructive">Không tải được sơ đồ tổ chức.</p>;
  }
  const nodes = data?.nodes ?? [];
  if (nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {mode === 'unit'
          ? 'Chưa có đơn vị nào ở cấp này.'
          : 'Không có nhân sự nào ở tuyến này.'}
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {nodes.map((n) => (
        <NodeRow key={n.id} node={n} mode={mode} />
      ))}
    </div>
  );
}
