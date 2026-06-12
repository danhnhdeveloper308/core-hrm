import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from './permissions';

/** 3 role hệ thống — seed sẵn, không xoá được (`isSystem = true`). */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES = Object.values(ROLES) as [RoleName, ...RoleName[]];

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  SUPER_ADMIN: 'Toàn quyền hệ thống, không thể bị hạ quyền nếu là người cuối cùng',
  ADMIN: 'Quản trị người dùng, phiên đăng nhập và audit log',
  USER: 'Người dùng thông thường',
};

/** Map role → permissions mặc định, dùng cho seed. */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  ADMIN: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.ROLE_READ,
    PERMISSIONS.ROLE_ASSIGN,
    PERMISSIONS.PERMISSION_READ,
    PERMISSIONS.SESSION_READ,
    PERMISSIONS.SESSION_REVOKE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.DASHBOARD_VIEW,
  ],
  USER: [PERMISSIONS.DASHBOARD_VIEW],
};
