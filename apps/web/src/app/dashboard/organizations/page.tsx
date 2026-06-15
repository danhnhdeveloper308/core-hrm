'use client';

import {
  PERMISSIONS,
  type OrganizationResponse,
  type Paginated,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataGrid } from '@/components/data-grid';
import { FadeIn } from '@/components/motion/primitives';
import { OrgFormDialog } from '@/components/organizations/org-form-dialog';
import { PermissionGate } from '@/components/permission-gate';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { formatDateTime } from '@/lib/format';

function StatusCell({ value }: ICellRendererParams<OrganizationResponse, string>) {
  return value === 'ACTIVE' ? (
    <Badge>Hoạt động</Badge>
  ) : (
    <Badge variant="destructive">Tạm ngưng</Badge>
  );
}

export default function OrganizationsPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrganizationResponse | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.organizations.list({ limit: 100 }),
    queryFn: () =>
      api.get<Paginated<OrganizationResponse>>('/organizations?limit=100'),
  });

  const toggleStatus = useMutation({
    mutationFn: (org: OrganizationResponse) =>
      api.patch<OrganizationResponse>(`/organizations/${org.id}`, {
        status: org.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
      }),
    onSuccess: (org) => {
      toast.success(
        org.status === 'ACTIVE'
          ? `Đã kích hoạt lại ${org.name}`
          : `Đã tạm ngưng ${org.name}`,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Cập nhật thất bại'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(`/organizations/${id}`),
    onSuccess: (res) => {
      toast.success(res.message);
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
  });

  const columnDefs = useMemo<ColDef<OrganizationResponse>[]>(
    () => [
      { field: 'name', headerName: 'Tên tổ chức', flex: 2, sortable: true },
      { field: 'slug', headerName: 'Slug', flex: 1 },
      { field: 'timezone', headerName: 'Múi giờ', flex: 1 },
      {
        field: 'status',
        headerName: 'Trạng thái',
        width: 140,
        cellRenderer: StatusCell,
      },
      {
        field: 'createdAt',
        headerName: 'Ngày tạo',
        flex: 1,
        valueFormatter: ({ value }) => formatDateTime(value as string),
      },
      {
        headerName: '',
        width: 200,
        sortable: false,
        cellRenderer: ({ data: org }: ICellRendererParams<OrganizationResponse>) =>
          org ? (
            <div className="flex h-full items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggleStatus.mutate(org)}
              >
                {org.status === 'ACTIVE' ? 'Tạm ngưng' : 'Kích hoạt'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteTarget(org)}
              >
                Xoá
              </Button>
            </div>
          ) : null,
      },
    ],
    [toggleStatus],
  );

  return (
    <FadeIn className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tổ chức</h1>
          <p className="text-muted-foreground">
            Quản lý các doanh nghiệp trên nền tảng
          </p>
        </div>
        <PermissionGate permission={PERMISSIONS.ORG_CREATE}>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> Tạo tổ chức
          </Button>
        </PermissionGate>
      </div>

      {isLoading ? (
        <Skeleton className="h-[480px] w-full" />
      ) : (
        <DataGrid<OrganizationResponse>
          containerClassName="h-[560px]"
          rowData={data?.items ?? []}
          columnDefs={columnDefs}
          defaultColDef={{ resizable: true, suppressMovable: true }}
        />
      )}

      <OrgFormDialog open={formOpen} onClose={() => setFormOpen(false)} />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá tổ chức {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Toàn bộ dữ liệu tenant (người dùng, cơ cấu, chấm công...) sẽ bị xoá
              vĩnh viễn. Không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Xoá vĩnh viễn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FadeIn>
  );
}
