'use client';

import type { Permission } from '@repo/shared';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth-store';

interface PermissionGateProps {
  /** 1 permission hoặc danh sách (AND — cần đủ tất cả). */
  permission: Permission | Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}

/** Ẩn UI theo quyền — backend vẫn là lớp kiểm tra cuối cùng. */
export function PermissionGate({
  permission,
  children,
  fallback = null,
}: PermissionGateProps) {
  const user = useAuthStore((s) => s.user);
  const permissions = user?.permissions ?? [];
  const required = Array.isArray(permission) ? permission : [permission];
  const allowed = required.every((p) => permissions.includes(p));
  return allowed ? children : fallback;
}
