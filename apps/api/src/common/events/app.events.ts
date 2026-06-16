import type { AuditLog, SessionRevokeReason } from '@repo/shared';

/**
 * Tên event nội bộ (EventEmitter2) — cầu nối giữa các module:
 * auth/users phát event, gateway (Phase 5) và audit (Phase 6) lắng nghe.
 */
export const APP_EVENTS = {
  /** Yêu cầu logout mọi client của user (ban, token reuse, logout-all). */
  FORCE_LOGOUT: 'socket.force-logout',
  /** 1 session cụ thể bị revoke → client của session đó tự logout. */
  SESSION_REVOKED: 'socket.session-revoked',
  /** Role/permission/status của user thay đổi → FE refetch. */
  USER_UPDATED: 'socket.user-updated',
  /** Ghi 1 dòng audit log (đẩy qua queue, không block request). */
  AUDIT_RECORD: 'audit.record',
  /** Audit log đã được persist — gateway emit `audit:created` tới room:audit. */
  AUDIT_CREATED: 'audit.created',
  /** Một ApprovalInstance kết thúc (APPROVED/REJECTED) — module đích xử lý hệ quả. */
  APPROVAL_DECIDED: 'approval.decided',
  /** Cần gửi thông báo tới user (Phase 8 Notification center). */
  NOTIFY: 'notify.dispatch',
} as const;

export interface ApprovalDecidedEvent {
  orgId: string;
  targetType: 'LEAVE' | 'ATTENDANCE_CORRECTION' | 'OT';
  targetId: string;
  status: 'APPROVED' | 'REJECTED';
}

export type AuditCreatedEvent = AuditLog;

export interface ForceLogoutEvent {
  userId: string;
  reason: string;
}

export interface SessionRevokedEvent {
  userId: string;
  sessionId: string;
  reason: SessionRevokeReason;
}

export interface UserUpdatedEvent {
  userId: string;
  reason: 'roles' | 'permissions' | 'status' | 'profile';
}

export interface AuditRecordEvent {
  actorId?: string | null;
  actorEmail?: string | null;
  /** Dạng `resource.action`, vd `auth.login`. */
  action: string;
  resource: string;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}
