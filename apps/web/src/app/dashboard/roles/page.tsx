'use client';

import {
  PERMISSIONS,
  type Paginated,
  type RoleResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PermissionGate } from '@/components/permission-gate';
import { PermissionMatrixDialog } from '@/components/roles/permission-matrix-dialog';
import { RoleFormDialog } from '@/components/roles/role-form-dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

export default function RolesPage() {
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoleResponse | null>(null);
  const [matrixTarget, setMatrixTarget] = useState<RoleResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleResponse | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.roles.list({ limit: 100 }),
    queryFn: () => api.get<Paginated<RoleResponse>>('/roles?limit=100'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/roles/${id}`),
    onSuccess: (res) => {
      toast.success(res.message);
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá role thất bại'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vai trò</h1>
          <p className="text-muted-foreground">
            Quản lý role và ma trận permissions
          </p>
        </div>
        <PermissionGate permission={PERMISSIONS.ROLE_CREATE}>
          <Button
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Tạo role
          </Button>
        </PermissionGate>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Số user</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : data?.items.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        {role.name}
                        <Badge variant={role.orgId ? 'secondary' : 'default'}>
                          {role.orgName ?? 'Hệ thống'}
                        </Badge>
                        {role.isSystem ? (
                          <Badge variant="outline">mặc định</Badge>
                        ) : null}
                      </div>
                      {role.description ? (
                        <p className="text-xs text-muted-foreground">
                          {role.description}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {role.permissions.length} quyền
                      </Badge>
                    </TableCell>
                    <TableCell>{role.userCount}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Thao tác">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <PermissionGate permission={PERMISSIONS.ROLE_UPDATE}>
                            <DropdownMenuItem onClick={() => setMatrixTarget(role)}>
                              <KeyRound className="size-4" /> Phân quyền
                            </DropdownMenuItem>
                            {!role.isSystem && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditTarget(role);
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil className="size-4" /> Sửa thông tin
                              </DropdownMenuItem>
                            )}
                          </PermissionGate>
                          <PermissionGate permission={PERMISSIONS.ROLE_DELETE}>
                            {!role.isSystem && (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteTarget(role)}
                              >
                                <Trash2 className="size-4" /> Xoá role
                              </DropdownMenuItem>
                            )}
                          </PermissionGate>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      <RoleFormDialog
        open={formOpen}
        role={editTarget}
        onClose={() => setFormOpen(false)}
      />
      <PermissionMatrixDialog
        role={matrixTarget}
        onClose={() => setMatrixTarget(null)}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá role {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.userCount
                ? `${deleteTarget.userCount} user đang giữ role này sẽ bị gỡ quyền ngay lập tức.`
                : 'Role chưa gán cho user nào.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Xoá role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
