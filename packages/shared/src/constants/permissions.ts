/**
 * Danh sách permission chuẩn của hệ thống, format `resource:action`.
 * Đây là source of truth — seed DB, guard backend và PermissionGate frontend
 * đều import từ đây.
 */
export const PERMISSIONS = {
  // user
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  // role
  ROLE_READ: 'role:read',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',
  ROLE_ASSIGN: 'role:assign',
  // permission
  PERMISSION_READ: 'permission:read',
  // session
  SESSION_READ: 'session:read',
  SESSION_REVOKE: 'session:revoke',
  // audit
  AUDIT_READ: 'audit:read',
  // dashboard
  DASHBOARD_VIEW: 'dashboard:view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as [
  Permission,
  ...Permission[],
];

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'user:read': 'Xem danh sách và chi tiết người dùng',
  'user:create': 'Tạo người dùng mới',
  'user:update': 'Cập nhật thông tin / trạng thái người dùng',
  'user:delete': 'Xoá người dùng',
  'role:read': 'Xem danh sách vai trò',
  'role:create': 'Tạo vai trò mới',
  'role:update': 'Cập nhật vai trò và quyền của vai trò',
  'role:delete': 'Xoá vai trò',
  'role:assign': 'Gán / bỏ vai trò cho người dùng',
  'permission:read': 'Xem danh sách quyền',
  'session:read': 'Xem phiên đăng nhập của người dùng khác',
  'session:revoke': 'Thu hồi phiên đăng nhập của người dùng khác',
  'audit:read': 'Xem nhật ký hệ thống (audit log)',
  'dashboard:view': 'Truy cập dashboard',
};

/** Resource gốc của 1 permission, vd `user:read` → `user`. */
export function permissionResource(permission: Permission): string {
  return permission.split(':', 1)[0] ?? permission;
}
