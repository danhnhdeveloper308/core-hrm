'use client';

import {
  PERMISSION_DESCRIPTIONS,
  PLATFORM_ONLY_PERMISSIONS,
  ROLES,
  type Permission,
  type RoleResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

interface PermissionRow {
  id: string;
  name: Permission;
  description: string | null;
}

interface PermissionMatrixDialogProps {
  role: RoleResponse | null;
  onClose: () => void;
}

/** Ma trận checkbox permissions nhóm theo resource (user, role, session…). */
export function PermissionMatrixDialog({
  role,
  onClose,
}: PermissionMatrixDialogProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<Permission>>(new Set());
  // Reset selection khi đổi role — adjust-during-render thay cho useEffect
  const [lastRoleId, setLastRoleId] = useState<string | null>(null);
  if ((role?.id ?? null) !== lastRoleId) {
    setLastRoleId(role?.id ?? null);
    setSelected(new Set(role?.permissions ?? []));
  }

  const { data: permissions } = useQuery({
    queryKey: queryKeys.permissions,
    queryFn: () => api.get<PermissionRow[]>('/permissions'),
    enabled: role !== null,
  });

  const mutation = useMutation({
    mutationFn: (perms: Permission[]) =>
      api.put<RoleResponse>(`/roles/${role?.id}/permissions`, {
        permissions: perms,
      }),
    onSuccess: () => {
      toast.success('Đã cập nhật quyền — có hiệu lực ngay với mọi user');
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
      onClose();
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : 'Cập nhật quyền thất bại',
      ),
  });

  const locked = role?.name === ROLES.SUPER_ADMIN;

  // Org admin (user thuộc org) không được gán quyền cấp hệ thống → ẩn khỏi matrix
  const isOrgScoped = useAuthStore.getState().user?.orgId != null;
  const platformOnly = new Set<string>(PLATFORM_ONLY_PERMISSIONS);

  const byResource = new Map<string, PermissionRow[]>();
  for (const perm of permissions ?? []) {
    if (isOrgScoped && platformOnly.has(perm.name)) continue;
    const resource = perm.name.split(':')[0] ?? perm.name;
    const group = byResource.get(resource) ?? [];
    group.push(perm);
    byResource.set(resource, group);
  }

  function toggle(name: Permission) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleResource(perms: PermissionRow[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (checked) next.add(p.name);
        else next.delete(p.name);
      }
      return next;
    });
  }

  return (
    <Dialog open={role !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Phân quyền — {role?.name}</DialogTitle>
          <DialogDescription>
            {locked
              ? 'SUPER_ADMIN luôn có toàn quyền, không thể chỉnh sửa.'
              : 'Thay đổi có hiệu lực ngay lập tức (cache được invalidate realtime).'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {[...byResource.entries()].map(([resource, perms]) => {
            const allChecked = perms.every((p) => selected.has(p.name));
            return (
              <div key={resource} className="rounded-md border p-3">
                <label className="mb-2 flex cursor-pointer items-center gap-2 font-medium capitalize">
                  <Checkbox
                    checked={allChecked}
                    disabled={locked}
                    onCheckedChange={(checked) =>
                      toggleResource(perms, checked === true)
                    }
                  />
                  {resource}
                </label>
                <div className="grid gap-2 pl-6">
                  {perms.map((perm) => (
                    <label
                      key={perm.id}
                      className="flex cursor-pointer items-start gap-2 text-sm"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={selected.has(perm.name)}
                        disabled={locked}
                        onCheckedChange={() => toggle(perm.name)}
                      />
                      <span>
                        <code className="text-xs">{perm.name}</code>
                        <span className="block text-xs text-muted-foreground">
                          {perm.description ??
                            PERMISSION_DESCRIPTIONS[perm.name] ??
                            ''}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          {!locked && (
            <Button
              onClick={() => mutation.mutate([...selected])}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Đang lưu…' : 'Lưu quyền'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
