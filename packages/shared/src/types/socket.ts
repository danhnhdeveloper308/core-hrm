import type { ApprovalTargetType } from '../schemas/approval';
import type { AuditLog } from '../schemas/audit';
import type { Notification } from '../schemas/notification';
import type { SessionRevokeReason } from '../schemas/session';

/**
 * Map tên event Socket.IO → payload. Backend gateway và FE `useSocket`
 * đều type theo map này — đổi tên event/payload chỉ sửa 1 chỗ.
 */
export interface SocketEvents {
  /** Emit vào room `session:{id}` khi session đó bị revoke → client tự logout. */
  'session:revoked': {
    sessionId: string;
    reason: SessionRevokeReason;
  };
  /** Emit vào room `room:audit` khi có audit log mới (admin xem realtime). */
  'audit:created': AuditLog;
  /** Emit vào room `user:{id}` khi role/permission/profile của user thay đổi → FE refetch. */
  'user:updated': {
    userId: string;
    reason: 'roles' | 'permissions' | 'status' | 'profile';
  };
  /** Emit vào room `user:{id}` khi cần logout mọi client của user (ban, token reuse...). */
  'force:logout': {
    reason: string;
  };
  /** Emit vào room `user:{id}` khi có thông báo mới (chuông in-app realtime). */
  'notification:new': Notification;
  /**
   * Emit vào room `user:{id}` của requester + mọi approver khi 1 phiếu duyệt
   * đổi trạng thái → FE invalidate dữ liệu domain tương ứng (không cần reload).
   */
  'approval:changed': {
    targetType: ApprovalTargetType;
    targetId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  };
}

export type SocketEventName = keyof SocketEvents;

export type SocketEventPayload<E extends SocketEventName> = SocketEvents[E];

/** Tên room chuẩn — dùng chung backend/FE để tránh gõ nhầm chuỗi. */
export const SOCKET_ROOMS = {
  user: (userId: string) => `user:${userId}` as const,
  session: (sessionId: string) => `session:${sessionId}` as const,
  /** Audit toàn hệ thống — chỉ platform admin (orgId=null) join. */
  audit: 'room:audit',
  /** Audit phạm vi 1 tenant — org admin join để nhận realtime log org mình. */
  auditOrg: (orgId: string) => `room:audit:${orgId}` as const,
} as const;
