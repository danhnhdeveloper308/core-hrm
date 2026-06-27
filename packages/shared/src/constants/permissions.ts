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
  // organization (org:create/delete = platform admin)
  ORG_READ: 'org:read',
  ORG_UPDATE: 'org:update',
  ORG_CREATE: 'org:create',
  ORG_DELETE: 'org:delete',
  // employee
  EMPLOYEE_READ: 'employee:read',
  EMPLOYEE_CREATE: 'employee:create',
  EMPLOYEE_UPDATE: 'employee:update',
  EMPLOYEE_DELETE: 'employee:delete',
  // cơ cấu tổ chức
  ORGUNIT_MANAGE: 'orgunit:manage',
  // ca làm việc / lịch
  SHIFT_MANAGE: 'shift:manage',
  // chấm công
  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_READ_ALL: 'attendance:read_all',
  ATTENDANCE_CORRECT: 'attendance:correct',
  // tăng ca (cấu hình trần OT — xem tổng hợp dùng attendance:read_all)
  OVERTIME_MANAGE: 'overtime:manage',
  // hợp đồng lao động
  CONTRACT_READ: 'contract:read',
  CONTRACT_MANAGE: 'contract:manage',
  // tuyển dụng (manpower/requisition/candidate/interview dùng chung)
  RECRUITMENT_READ: 'recruitment:read',
  RECRUITMENT_MANAGE: 'recruitment:manage',
  OFFER_MANAGE: 'offer:manage',
  // hiệu suất / KPI / 360° (đọc theo scope; manage = HR cấu hình; conduct = quản lý chấm điểm/ký)
  PERFORMANCE_READ: 'performance:read',
  PERFORMANCE_MANAGE: 'performance:manage',
  REVIEW_CONDUCT: 'review:conduct',
  // nghỉ phép
  LEAVE_READ: 'leave:read',
  LEAVE_REQUEST: 'leave:request',
  LEAVE_APPROVE: 'leave:approve',
  LEAVE_MANAGE_POLICY: 'leave:manage_policy',
  // phê duyệt
  APPROVAL_MANAGE_FLOW: 'approval:manage_flow',
  // phiếu tăng/giãn ca theo danh sách (upload + xem + thống kê) — nhân viên VP+
  SHIFT_REGISTRATION_MANAGE: 'shift_registration:manage',
  // máy chấm công
  DEVICE_MANAGE: 'device:manage',
  // địa điểm làm việc
  WORKSITE_MANAGE: 'worksite:manage',
  // báo cáo
  REPORT_READ: 'report:read',
  // khuôn mặt
  FACE_ENROLL: 'face:enroll',
  FACE_MANAGE: 'face:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as [
  Permission,
  ...Permission[],
];

/**
 * Quyền CHỈ dành cho platform admin (SUPER_ADMIN). ORG_ADMIN không được gán
 * các quyền này cho role trong org (chống leo thang khi org tự quản lý role).
 */
export const PLATFORM_ONLY_PERMISSIONS: Permission[] = [
  PERMISSIONS.ORG_CREATE,
  PERMISSIONS.ORG_DELETE,
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
  'org:read': 'Xem thông tin tổ chức',
  'org:update': 'Cập nhật thông tin tổ chức',
  'org:create': 'Tạo tổ chức mới (platform admin)',
  'org:delete': 'Xoá tổ chức (platform admin)',
  'employee:read': 'Xem hồ sơ nhân viên',
  'employee:create': 'Tạo hồ sơ nhân viên',
  'employee:update': 'Cập nhật hồ sơ nhân viên',
  'employee:delete': 'Xoá hồ sơ nhân viên',
  'orgunit:manage': 'Quản lý cây cơ cấu tổ chức, loại đơn vị, chức danh',
  'shift:manage': 'Quản lý ca làm việc, phân ca, lịch nghỉ lễ',
  'attendance:read': 'Xem dữ liệu chấm công của bản thân',
  'attendance:read_all': 'Xem dữ liệu chấm công của người khác (theo scope)',
  'attendance:correct': 'Sửa công thủ công',
  'overtime:manage': 'Cấu hình trần giờ tăng ca (OT) theo tổ chức / đơn vị',
  'contract:read': 'Xem hợp đồng lao động',
  'contract:manage': 'Tạo / sửa / chấm dứt hợp đồng lao động',
  'recruitment:read': 'Xem dữ liệu tuyển dụng (yêu cầu, tin, ứng viên, phỏng vấn)',
  'recruitment:manage': 'Quản lý tuyển dụng (yêu cầu, tin, ứng viên, phỏng vấn)',
  'offer:manage': 'Tạo / duyệt / gửi thư mời nhận việc (offer)',
  'performance:read':
    'Xem chu kỳ, thư viện KPI, mục tiêu & đánh giá (theo phạm vi) + KPI dashboard',
  'performance:manage':
    'Quản lý chu kỳ đánh giá, thư viện KPI và khởi tạo đánh giá / 360°',
  'review:conduct': 'Chấm điểm đánh giá (quản lý), giao mục tiêu cấp dưới & ký duyệt',
  'leave:read': 'Xem số dư và đơn nghỉ phép',
  'leave:request': 'Tạo đơn nghỉ phép',
  'leave:approve': 'Phê duyệt đơn nghỉ phép (duyệt thay mọi bước)',
  'leave:manage_policy': 'Cấu hình loại phép và chính sách phép',
  'approval:manage_flow': 'Cấu hình luồng phê duyệt',
  'shift_registration:manage': 'Đăng ký + xem phiếu tăng/giãn ca theo danh sách',
  'device:manage': 'Quản lý máy chấm công và mã nhân viên trên máy',
  'worksite:manage': 'Quản lý địa điểm làm việc (geofence)',
  'report:read': 'Xem và xuất báo cáo',
  'face:enroll': 'Đăng ký khuôn mặt (bản thân hoặc HR đăng ký hộ)',
  'face:manage': 'Quản lý / xoá dữ liệu khuôn mặt nhân viên',
};

/** Resource gốc của 1 permission, vd `user:read` → `user`. */
export function permissionResource(permission: Permission): string {
  return permission.split(':', 1)[0] ?? permission;
}
