'use client';

import {
  type OrgUnitResponse,
  type TimesheetGridRow,
  type TimesheetStatus,
} from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { DataGrid } from '@/components/data-grid';
import { FadeIn } from '@/components/motion/primitives';
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
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

const ALL = '__all__';

/** Mã trạng thái ngắn + màu cell (HSL nền nhạt) cho lưới công. */
const STATUS_META: Record<TimesheetStatus, { label: string; bg: string; fg: string }> = {
  PRESENT: { label: 'P', bg: 'rgba(34,197,94,0.18)', fg: '#15803d' },
  LATE: { label: 'L', bg: 'rgba(234,179,8,0.20)', fg: '#a16207' },
  EARLY_LEAVE: { label: 'E', bg: 'rgba(249,115,22,0.18)', fg: '#c2410c' },
  LATE_AND_EARLY: { label: 'LE', bg: 'rgba(249,115,22,0.22)', fg: '#9a3412' },
  ABSENT: { label: 'V', bg: 'rgba(239,68,68,0.20)', fg: '#b91c1c' },
  ON_LEAVE: { label: 'N', bg: 'rgba(59,130,246,0.18)', fg: '#1d4ed8' },
  HALF_LEAVE: { label: 'N½', bg: 'rgba(59,130,246,0.12)', fg: '#2563eb' },
  HOLIDAY: { label: 'LE', bg: 'rgba(168,85,247,0.16)', fg: '#7e22ce' },
  WEEKEND: { label: 'T7', bg: 'rgba(148,163,184,0.15)', fg: '#64748b' },
  NOT_SCHEDULED: { label: '–', bg: 'transparent', fg: '#94a3b8' },
};

function monthDays(year: number, month: number): string[] {
  const days: string[] = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    days.push(
      `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    );
  }
  return days;
}

export default function AttendancePage() {
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  );
  const [orgUnitId, setOrgUnitId] = useState(ALL);

  const [year, monthNum] = month.split('-').map(Number) as [number, number];
  const days = useMemo(() => monthDays(year, monthNum), [year, monthNum]);
  const from = days[0] ?? `${month}-01`;
  const to = days[days.length - 1] ?? `${month}-28`;

  const { data: units } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'grid', { from, to, orgUnitId }],
    queryFn: () => {
      const qs = new URLSearchParams({ from, to });
      if (orgUnitId !== ALL) qs.set('orgUnitId', orgUnitId);
      return api.get<TimesheetGridRow[]>(`/attendance/grid?${qs.toString()}`);
    },
  });

  const columnDefs = useMemo<ColDef<TimesheetGridRow>[]>(() => {
    const cols: ColDef<TimesheetGridRow>[] = [
      {
        field: 'employeeName',
        headerName: 'Nhân viên',
        pinned: 'left',
        width: 200,
        valueGetter: (p) =>
          p.data ? `${p.data.employeeCode} · ${p.data.employeeName}` : '',
      },
    ];
    for (const date of days) {
      const dayNum = Number(date.slice(8, 10));
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      cols.push({
        colId: date,
        headerName: String(dayNum),
        width: 46,
        sortable: false,
        headerClass: weekday === 0 || weekday === 6 ? 'text-muted-foreground' : '',
        valueGetter: (p) => p.data?.days[date]?.status ?? '',
        cellRenderer: (p: ICellRendererParams<TimesheetGridRow>) => {
          const day = p.data?.days[date];
          if (!day) return '';
          const meta = STATUS_META[day.status];
          return (
            <div
              className="flex h-full items-center justify-center text-xs font-semibold"
              style={{ backgroundColor: meta.bg, color: meta.fg }}
              title={
                day.lateMinutes || day.earlyMinutes
                  ? `Trễ ${day.lateMinutes}p, sớm ${day.earlyMinutes}p`
                  : day.status
              }
            >
              {meta.label}
            </div>
          );
        },
      });
    }
    return cols;
  }, [days]);

  return (
    <FadeIn className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Bảng công tháng</h1>
        <p className="text-muted-foreground">
          P=Đủ công · L=Trễ · E=Về sớm · V=Vắng · N=Nghỉ phép · LE=Lễ
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Tháng</Label>
          <Input
            type="month"
            className="w-40"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Đơn vị</Label>
          <Select value={orgUnitId} onValueChange={setOrgUnitId}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi đơn vị</SelectItem>
              {(units ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-[560px] w-full" />
      ) : (
        <DataGrid<TimesheetGridRow>
          containerClassName="h-[600px]"
          rowData={data ?? []}
          columnDefs={columnDefs}
          defaultColDef={{ resizable: false, suppressMovable: true }}
          headerHeight={32}
          rowHeight={36}
        />
      )}
    </FadeIn>
  );
}
