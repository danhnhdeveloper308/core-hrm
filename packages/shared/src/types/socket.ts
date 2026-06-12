import type { AuditLog } from '../schemas/audit';
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
}

export type SocketEventName = keyof SocketEvents;

export type SocketEventPayload<E extends SocketEventName> = SocketEvents[E];

/** Tên room chuẩn — dùng chung backend/FE để tránh gõ nhầm chuỗi. */
export const SOCKET_ROOMS = {
  user: (userId: string) => `user:${userId}` as const,
  session: (sessionId: string) => `session:${sessionId}` as const,
  audit: 'room:audit',
} as const;
