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
const WEEKDAY_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

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
        width: 190,
        cellRenderer: (p: ICellRendererParams<TimesheetGridRow>) =>
          p.data ? (
            <div className="leading-tight">
              <div className="font-medium">{p.data.employeeName}</div>
              <div className="text-xs text-muted-foreground">
                {p.data.employeeCode}
                {p.data.orgUnitName ? ` · ${p.data.orgUnitName}` : ''}
              </div>
            </div>
          ) : null,
      },
    ];
    for (const date of days) {
      const dayNum = Number(date.slice(8, 10));
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const isWeekend = weekday === 0 || weekday === 6;
      cols.push({
        colId: date,
        headerName: `${dayNum}`,
        headerTooltip: `Ngày ${dayNum} (${WEEKDAY_VN[weekday]})`,
        width: 44,
        sortable: false,
        headerClass: isWeekend ? 'ag-weekend-header' : '',
        valueGetter: (p) => p.data?.days[date]?.status ?? '',
        cellStyle: isWeekend ? { backgroundColor: 'rgba(148,163,184,0.06)' } : undefined,
        cellRenderer: (p: ICellRendererParams<TimesheetGridRow>) => {
          const day = p.data?.days[date];
          if (!day) return '';
          const meta = STATUS_META[day.status];
          const tip =
            day.lateMinutes || day.earlyMinutes
              ? `${meta.label}: trễ ${day.lateMinutes}p, sớm ${day.earlyMinutes}p`
              : meta.label;
          return (
            <div
              className="m-0.5 flex h-[calc(100%-4px)] items-center justify-center rounded text-xs font-semibold"
              style={{ backgroundColor: meta.bg, color: meta.fg }}
              title={tip}
            >
              {meta.label}
            </div>
          );
        },
      });
    }
    // Cột tổng cuối: công / trễ / vắng
    cols.push(
      {
        colId: 'totalPresent',
        headerName: 'Công',
        width: 64,
        pinned: 'right',
        cellClass: 'text-center font-semibold text-green-600',
        valueGetter: (p) =>
          Object.values(p.data?.days ?? {}).filter((d) =>
            ['PRESENT', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY'].includes(d.status),
          ).length,
      },
      {
        colId: 'totalLate',
        headerName: 'Trễ',
        width: 56,
        pinned: 'right',
        cellClass: 'text-center text-amber-600',
        valueGetter: (p) =>
          Object.values(p.data?.days ?? {}).filter((d) => d.lateMinutes > 0).length,
      },
      {
        colId: 'totalAbsent',
        headerName: 'Vắng',
        width: 60,
        pinned: 'right',
        cellClass: 'text-center text-destructive',
        valueGetter: (p) =>
          Object.values(p.data?.days ?? {}).filter((d) => d.status === 'ABSENT')
            .length,
      },
    );
    return cols;
  }, [days]);

  const legend: { status: TimesheetStatus; text: string }[] = [
    { status: 'PRESENT', text: 'Đủ công' },
    { status: 'LATE', text: 'Đi trễ' },
    { status: 'EARLY_LEAVE', text: 'Về sớm' },
    { status: 'ABSENT', text: 'Vắng' },
    { status: 'ON_LEAVE', text: 'Nghỉ phép' },
    { status: 'HOLIDAY', text: 'Nghỉ lễ' },
    { status: 'WEEKEND', text: 'Cuối tuần' },
  ];

  return (
    <FadeIn className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Bảng công tháng</h1>
        <p className="text-muted-foreground">
          Mỗi ô = trạng thái 1 ngày. Di chuột để xem chi tiết trễ/sớm.
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

      {/* Chú giải màu */}
      <div className="flex flex-wrap gap-3 text-xs">
        {legend.map((l) => {
          const meta = STATUS_META[l.status];
          return (
            <span key={l.status} className="flex items-center gap-1.5">
              <span
                className="inline-flex size-5 items-center justify-center rounded text-[10px] font-semibold"
                style={{ backgroundColor: meta.bg, color: meta.fg }}
              >
                {meta.label}
              </span>
              {l.text}
            </span>
          );
        })}
      </div>

      {isLoading ? (
        <Skeleton className="h-[560px] w-full" />
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-md border py-16 text-center text-muted-foreground">
          Không có nhân viên nào trong phạm vi xem
        </div>
      ) : (
        <DataGrid<TimesheetGridRow>
          containerClassName="h-[600px]"
          rowData={data ?? []}
          columnDefs={columnDefs}
          defaultColDef={{ resizable: false, suppressMovable: true }}
          headerHeight={34}
          rowHeight={40}
          tooltipShowDelay={300}
        />
      )}
    </FadeIn>
  );
}
