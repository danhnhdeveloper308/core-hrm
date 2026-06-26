'use client';

import {
  PERMISSIONS,
  type CursorPaginated,
  type EmployeeResponse,
  type ImportEmployeesResult,
  type OrgUnitResponse,
} from '@repo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  IDatasource,
  ICellRendererParams,
} from 'ag-grid-community';
import { Download, FileUp, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DataGrid } from '@/components/data-grid';
import { EmployeeDetailSheet } from '@/components/employees/employee-detail-sheet';
import { EmployeeFormDialog } from '@/components/employees/employee-form-dialog';
import { FadeIn } from '@/components/motion/primitives';
import { PermissionGate } from '@/components/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { orgUnitOptions } from '@/lib/org';

const ALL = '__all__';
const PAGE_SIZE = 50;
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001/api';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Chính thức',
  PROBATION: 'Thử việc',
  INACTIVE: 'Tạm nghỉ',
  TERMINATED: 'Đã nghỉ',
};

function StatusCell({ value }: ICellRendererParams<EmployeeResponse, string>) {
  if (!value) return null;
  const variant =
    value === 'ACTIVE'
      ? 'default'
      : value === 'TERMINATED'
        ? 'destructive'
        : 'secondary';
  return <Badge variant={variant}>{STATUS_LABELS[value] ?? value}</Badge>;
}

export default function EmployeesPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [orgUnitId, setOrgUnitId] = useState(ALL);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeResponse | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportEmployeesResult | null>(null);
  const gridApiRef = useRef<GridApi<EmployeeResponse> | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: units } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
  });

  // Infinite Row Model nối cursor pagination: block N giữ cursor cho block N+1
  const datasource = useMemo<IDatasource>(() => {
    const cursorByStartRow: Record<number, string> = {};
    return {
      getRows: (params) => {
        const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (debouncedSearch) qs.set('search', debouncedSearch);
        if (status !== ALL) qs.set('status', status);
        if (orgUnitId !== ALL) qs.set('orgUnitId', orgUnitId);
        const cursor = cursorByStartRow[params.startRow];
        if (cursor) qs.set('cursor', cursor);

        api
          .get<CursorPaginated<EmployeeResponse>>(`/employees?${qs.toString()}`)
          .then((res) => {
            if (res.nextCursor) {
              cursorByStartRow[params.startRow + res.items.length] = res.nextCursor;
            }
            const lastRow = res.nextCursor
              ? -1
              : params.startRow + res.items.length;
            params.successCallback(res.items, lastRow);
          })
          .catch(() => params.failCallback());
      },
    };
  }, [debouncedSearch, status, orgUnitId]);

  const onGridReady = useCallback((event: GridReadyEvent<EmployeeResponse>) => {
    gridApiRef.current = event.api;
  }, []);

  const refreshGrid = useCallback(() => {
    gridApiRef.current?.refreshInfiniteCache();
  }, []);

  async function downloadTemplate() {
    try {
      const res = await fetch(`${BASE_URL}/employees/import/template`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mau-import-nhan-vien.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Không tải được file mẫu');
    }
  }

  const importMut = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<ImportEmployeesResult>('/employees/import', form);
    },
    onSuccess: (result) => {
      setImportResult(result);
      if (result.created > 0) {
        toast.success(`Đã nhập ${result.created} nhân viên`);
        refreshGrid();
      }
      if (result.created === 0 && result.failed.length > 0) {
        toast.error('Không nhập được dòng nào — xem chi tiết lỗi');
      }
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Nhập file thất bại'),
  });

  const columnDefs = useMemo<ColDef<EmployeeResponse>[]>(
    () => [
      { field: 'code', headerName: 'Mã NV', width: 120, pinned: 'left' },
      { field: 'fullName', headerName: 'Họ tên', flex: 2, minWidth: 180 },
      { field: 'orgUnitName', headerName: 'Đơn vị', flex: 1.5, minWidth: 140 },
      { field: 'positionName', headerName: 'Chức danh', flex: 1, minWidth: 120 },
      { field: 'phone', headerName: 'Điện thoại', width: 130 },
      { field: 'joinDate', headerName: 'Vào làm', width: 120 },
      {
        field: 'status',
        headerName: 'Trạng thái',
        width: 130,
        cellRenderer: StatusCell,
      },
    ],
    [],
  );

  return (
    <FadeIn className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nhân viên</h1>
          <p className="text-muted-foreground">
            Hồ sơ nhân sự — click dòng để xem chi tiết
          </p>
        </div>
        <PermissionGate permission={PERMISSIONS.EMPLOYEE_CREATE}>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void downloadTemplate()}>
              <Download className="size-4" /> Tải mẫu Excel
            </Button>
            <Button
              variant="outline"
              disabled={importMut.isPending}
              onClick={() => importInputRef.current?.click()}
            >
              <FileUp className="size-4" />
              {importMut.isPending ? 'Đang nhập…' : 'Nhập từ Excel'}
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importMut.mutate(file);
                e.target.value = '';
              }}
            />
            <Button
              onClick={() => {
                setEditTarget(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" /> Thêm nhân viên
            </Button>
          </div>
        </PermissionGate>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm tên, mã, SĐT…"
            className="w-64 pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={orgUnitId} onValueChange={setOrgUnitId}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi đơn vị</SelectItem>
            {orgUnitOptions(units ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataGrid<EmployeeResponse>
        containerClassName="h-[600px]"
        rowModelType="infinite"
        datasource={datasource}
        cacheBlockSize={PAGE_SIZE}
        cacheOverflowSize={1}
        maxConcurrentDatasourceRequests={1}
        columnDefs={columnDefs}
        defaultColDef={{ resizable: true, sortable: false, suppressMovable: true }}
        onGridReady={onGridReady}
        onRowClicked={(e) => e.data && setDetailId(e.data.id)}
        rowStyle={{ cursor: 'pointer' }}
      />

      <EmployeeFormDialog
        open={formOpen}
        employee={editTarget}
        onClose={() => setFormOpen(false)}
        onSaved={refreshGrid}
      />
      <EmployeeDetailSheet
        employeeId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(employee) => {
          setEditTarget(employee);
          setFormOpen(true);
        }}
      />

      <Dialog
        open={importResult !== null}
        onOpenChange={(o) => !o && setImportResult(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kết quả nhập Excel</DialogTitle>
            <DialogDescription>
              {importResult
                ? `Tổng ${importResult.total} dòng · thành công ${importResult.created} · lỗi ${importResult.failed.length}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {importResult && importResult.failed.length > 0 && (
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {importResult.failed.map((f) => (
                <div
                  key={f.row}
                  className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm"
                >
                  <span className="font-medium">
                    Dòng {f.row}
                    {f.code ? ` · ${f.code}` : ''}
                  </span>
                  <p className="text-xs text-muted-foreground">{f.message}</p>
                </div>
              ))}
            </div>
          )}
          {importResult && importResult.failed.length === 0 && (
            <p className="text-sm text-emerald-600">
              Tất cả {importResult.created} dòng đã được nhập thành công.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </FadeIn>
  );
}
