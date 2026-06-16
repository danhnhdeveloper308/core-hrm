'use client';

import {
  PERMISSIONS,
  type Paginated,
  type UserResponse,
  type UserStatus,
} from '@repo/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontal,
  Search,
  ShieldPlus,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PermissionGate } from '@/components/permission-gate';
import { InviteUserDialog } from '@/components/users/invite-user-dialog';
import { AssignRolesDialog } from '@/components/users/assign-roles-dialog';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
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
import { formatDateTime, initials } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store';

const STATUS_BADGE: Record<UserStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  ACTIVE: { label: 'Hoạt động', variant: 'default' },
  INACTIVE: { label: 'Vô hiệu', variant: 'secondary' },
  BANNED: { label: 'Bị khoá', variant: 'destructive' },
};

type SortField = 'createdAt' | 'email' | 'name';

function SortHeader({
  field,
  sortField,
  sortDir,
  onToggle,
  children,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: 'asc' | 'desc';
  onToggle: (field: SortField) => void;
  children: string;
}) {
  const Icon =
    sortField !== field ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      className="flex items-center gap-1 hover:text-foreground"
      onClick={() => onToggle(field)}
    >
      {children}
      <Icon className="size-3.5" />
    </button>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [assignTarget, setAssignTarget] = useState<UserResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserResponse | null>(null);

  // Debounce search 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const limit = 10;
  const sort = `${sortField}:${sortDir}`;
  const query = { page, limit, search: search || undefined, sort };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.users.list(query),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort,
        ...(search ? { search } : {}),
      });
      return api.get<Paginated<UserResponse>>(`/users?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      api.patch<UserResponse>(`/users/${id}/status`, { status }),
    onSuccess: (updated) => {
      toast.success(`Đã đổi trạng thái ${updated.email ?? updated.username}`);
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Đổi trạng thái thất bại'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/users/${id}`),
    onSuccess: (res) => {
      toast.success(res.message);
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
  });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
  }

  const totalPages = data?.meta.totalPages ?? 1;
  const sortHeaderProps = { sortField, sortDir, onToggle: toggleSort };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Người dùng</h1>
          <p className="text-muted-foreground">
            {data ? `${data.meta.total} tài khoản` : 'Đang tải…'}
          </p>
        </div>
        <PermissionGate permission={PERMISSIONS.USER_CREATE}>
          <InviteUserDialog />
        </PermissionGate>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tìm theo tên hoặc email…"
          className="pl-9"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader field="name" {...sortHeaderProps}>Người dùng</SortHeader>
              </TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead>
                <SortHeader field="createdAt" {...sortHeaderProps}>Ngày tạo</SortHeader>
              </TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : data?.items.map((user) => {
                  const status = STATUS_BADGE[user.status];
                  const isSelf = user.id === me?.id;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            {user.avatarUrl ? (
                              <AvatarImage src={user.avatarUrl} alt={user.name} />
                            ) : null}
                            <AvatarFallback className="text-xs">
                              {initials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">
                              {user.name}
                              {isSelf ? (
                                <span className="ml-1 text-xs text-muted-foreground">(bạn)</span>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {user.email ?? user.username}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <Badge key={role.id} variant="outline">
                              {role.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(user.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Thao tác">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{user.email ?? user.username}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <PermissionGate permission={PERMISSIONS.ROLE_ASSIGN}>
                              <DropdownMenuItem onClick={() => setAssignTarget(user)}>
                                <ShieldPlus className="size-4" /> Gán vai trò
                              </DropdownMenuItem>
                            </PermissionGate>
                            <PermissionGate permission={PERMISSIONS.USER_UPDATE}>
                              {user.status !== 'ACTIVE' ? (
                                <DropdownMenuItem
                                  disabled={isSelf}
                                  onClick={() =>
                                    statusMutation.mutate({ id: user.id, status: 'ACTIVE' })
                                  }
                                >
                                  <UserCheck className="size-4" /> Kích hoạt lại
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  disabled={isSelf}
                                  variant="destructive"
                                  onClick={() =>
                                    statusMutation.mutate({ id: user.id, status: 'BANNED' })
                                  }
                                >
                                  <UserX className="size-4" /> Khoá tài khoản
                                </DropdownMenuItem>
                              )}
                            </PermissionGate>
                            <PermissionGate permission={PERMISSIONS.USER_DELETE}>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={isSelf}
                                variant="destructive"
                                onClick={() => setDeleteTarget(user)}
                              >
                                <Trash2 className="size-4" /> Xoá user
                              </DropdownMenuItem>
                            </PermissionGate>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
            {!isLoading && data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Không tìm thấy người dùng nào
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Trang {page}/{totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      </div>

      <AssignRolesDialog user={assignTarget} onClose={() => setAssignTarget(null)} />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá {deleteTarget?.email ?? deleteTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động không thể hoàn tác. Mọi session, role và dữ liệu liên quan
              của user sẽ bị xoá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Xoá vĩnh viễn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
