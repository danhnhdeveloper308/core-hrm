'use client';

import type { AuditLog, CursorPaginated } from '@repo/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { formatDateTime } from '@/lib/format';
import { useSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;
const RESOURCES = ['auth', 'user', 'role', 'session', 'audit'] as const;

function AuditRow({ log, isNew }: { log: AuditLog; isNew: boolean }) {
  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
  return (
    <div
      className={cn(
        'flex h-full items-center gap-3 border-b px-3 text-sm transition-colors duration-1000',
        isNew && 'bg-primary/10',
      )}
    >
      <span className="w-36 shrink-0 text-xs text-muted-foreground">
        {formatDateTime(log.createdAt)}
      </span>
      <Badge variant="outline" className="shrink-0 font-mono text-xs">
        {log.action}
      </Badge>
      <span className="w-48 shrink-0 truncate" title={log.actorEmail ?? ''}>
        {log.actorEmail ?? <span className="text-muted-foreground">hệ thống</span>}
      </span>
      <span className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground md:inline">
        {log.ip ?? ''}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {hasMetadata ? (
          <details className="inline">
            <summary className="cursor-pointer select-none">
              {JSON.stringify(log.metadata).slice(0, 80)}…
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          </details>
        ) : (
          '—'
        )}
      </span>
    </div>
  );
}

export default function AuditPage() {
  const [resource, setResource] = useState<string>('all');
  const [actionInput, setActionInput] = useState('');
  const [action, setAction] = useState('');

  // Dòng mới đến qua socket — prepend + highlight
  const [liveRows, setLiveRows] = useState<AuditLog[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => {
      setAction(actionInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [actionInput]);

  const filters = {
    ...(resource !== 'all' ? { resource } : {}),
    ...(action ? { action } : {}),
  };

  // Đổi filter → reset live rows (tránh lẫn dữ liệu không khớp filter)
  useEffect(() => {
    setLiveRows([]);
    setNewIds(new Set());
  }, [resource, action]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: queryKeys.audit.list(filters),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pageParam) params.set('cursor', pageParam);
      if (filters.resource) params.set('resource', filters.resource);
      if (filters.action) params.set('action', filters.action);
      return api.get<CursorPaginated<AuditLog>>(`/audit?${params}`);
    },
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  useSocket('audit:created', (log) => {
    if (filters.resource && log.resource !== filters.resource) return;
    if (filters.action && !log.action.includes(filters.action)) return;
    setLiveRows((prev) => [log, ...prev]);
    setNewIds((prev) => new Set(prev).add(log.id));
    setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        next.delete(log.id);
        return next;
      });
    }, 3_000);
  });

  const fetchedRows = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  // Khử trùng lặp giữa live rows và trang đã fetch
  const rows = useMemo(() => {
    const fetchedIds = new Set(fetchedRows.map((r) => r.id));
    return [...liveRows.filter((r) => !fetchedIds.has(r.id)), ...fetchedRows];
  }, [liveRows, fetchedRows]);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  // Gần cuối danh sách → tải trang tiếp theo
  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;
    if (last.index >= rows.length - 10 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [virtualItems, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-muted-foreground">
          Nhật ký hệ thống — dòng mới tự xuất hiện realtime
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={resource} onValueChange={setResource}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Resource" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả resource</SelectItem>
            {RESOURCES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Lọc theo action, vd user.update…"
          className="max-w-xs"
          value={actionInput}
          onChange={(e) => setActionInput(e.target.value)}
        />
      </div>

      <div
        ref={parentRef}
        className="min-h-0 flex-1 overflow-auto rounded-md border"
      >
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Đang tải…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            Chưa có bản ghi nào
          </div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          >
            {virtualItems.map((virtualRow) => {
              const log = rows[virtualRow.index];
              if (!log) return null;
              return (
                <div
                  key={log.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <AuditRow log={log} isNew={newIds.has(log.id)} />
                </div>
              );
            })}
          </div>
        )}
        {isFetchingNextPage ? (
          <div className="flex items-center justify-center p-3 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Đang tải thêm…
          </div>
        ) : null}
      </div>
    </div>
  );
}
