'use client';

import type { Paginated, RoleResponse, UserResponse } from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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

interface AssignRolesDialogProps {
  user: UserResponse | null;
  onClose: () => void;
}

export function AssignRolesDialog({ user, onClose }: AssignRolesDialogProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Reset selection khi đổi target — adjust-during-render thay cho useEffect
  const [lastUserId, setLastUserId] = useState<string | null>(null);
  if ((user?.id ?? null) !== lastUserId) {
    setLastUserId(user?.id ?? null);
    setSelected(new Set(user?.roles.map((r) => r.id) ?? []));
  }

  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.list({ limit: 100 }),
    queryFn: () => api.get<Paginated<RoleResponse>>('/roles?limit=100'),
    enabled: user !== null,
  });

  const mutation = useMutation({
    mutationFn: (roleIds: string[]) =>
      api.put<UserResponse>(`/users/${user?.id}/roles`, { roleIds }),
    onSuccess: () => {
      toast.success('Đã cập nhật vai trò');
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      onClose();
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : 'Cập nhật vai trò thất bại',
      ),
  });

  function toggle(roleId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }

  return (
    <Dialog open={user !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gán vai trò</DialogTitle>
          <DialogDescription>
            {user?.name} — {user?.email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {roles?.items.map((role) => (
            <label
              key={role.id}
              className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-accent/50"
            >
              <Checkbox
                checked={selected.has(role.id)}
                onCheckedChange={() => toggle(role.id)}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {role.name}
                  {role.isSystem ? (
                    <Badge variant="outline" className="text-xs">
                      hệ thống
                    </Badge>
                  ) : null}
                </div>
                {role.description ? (
                  <p className="text-xs text-muted-foreground">
                    {role.description}
                  </p>
                ) : null}
              </div>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={() => mutation.mutate([...selected])}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Đang lưu…' : 'Lưu vai trò'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
