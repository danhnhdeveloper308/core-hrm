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
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { cn } from '@/lib/utils';

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

  const { data: roles, isLoading } = useQuery({
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

  const hasChanges =
    user !== null &&
    (selected.size !== user.roles.length ||
      user.roles.some((r) => !selected.has(r.id)));

  return (
    <Dialog open={user !== null} onOpenChange={(o) => !o && onClose()}>
      {/*
        Layout chốt chiều cao theo viewport (max-h) + flex column,
        để vùng list role là phần duy nhất scroll được (flex-1 + overflow-y-auto).
        Header/Footer nằm ngoài vùng scroll nên luôn hiển thị (sticky-like).
        p-0 ở content để tự kiểm soát padding từng vùng, tránh footer/header
        bị che hoặc lệch trên màn hình nhỏ.
      */}
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12 text-left">
          <DialogTitle>Gán vai trò</DialogTitle>
          <DialogDescription className="truncate">
            {user?.name} — {user?.email ?? user?.username}
          </DialogDescription>
        </DialogHeader>

        {/* Vùng scroll: min-h-0 bắt buộc để flex item co lại đúng trong flex column */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[60px] w-full rounded-md" />
              ))}
            </div>
          ) : roles?.items.length ? (
            <div className="space-y-2">
              {roles.items.map((role) => {
                const checked = selected.has(role.id);
                return (
                  <label
                    key={role.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50',
                      checked && 'border-primary/50 bg-accent/30',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(role.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="break-words">{role.name}</span>
                        {role.isSystem ? (
                          <Badge variant="outline" className="text-xs">
                            hệ thống
                          </Badge>
                        ) : null}
                      </div>
                      {role.description ? (
                        <p className="mt-0.5 break-words text-xs text-muted-foreground">
                          {role.description}
                        </p>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Chưa có vai trò nào
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4 sm:justify-between">
          <p className="text-xs text-muted-foreground sm:self-center">
            {selected.size} vai trò đã chọn
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Huỷ
            </Button>
            <Button
              onClick={() => mutation.mutate([...selected])}
              disabled={mutation.isPending || !hasChanges}
            >
              {mutation.isPending ? 'Đang lưu…' : 'Lưu vai trò'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}