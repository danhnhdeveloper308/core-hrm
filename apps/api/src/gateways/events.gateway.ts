import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  PERMISSIONS,
  SOCKET_ROOMS,
  type SocketEventName,
  type SocketEvents,
} from '@repo/shared';
import type { Server, Socket } from 'socket.io';
import type { AccessTokenPayload } from '../common/decorators/current-user.decorator';
import {
  APP_EVENTS,
  type ApprovalChangedEvent,
  type AuditCreatedEvent,
  type ForceLogoutEvent,
  type NotifyEvent,
  type SessionRevokedEvent,
  type UserUpdatedEvent,
} from '../common/events/app.events';
import { parseCookieHeader } from '../common/utils/cookies';
import { AppConfigService } from '../config/app-config.service';
import { PermissionsCacheService } from '../modules/rbac/permissions-cache.service';

/** Map event → handler signature cho socket.io typed server. */
type ServerToClientEvents = {
  [K in SocketEventName]: (payload: SocketEvents[K]) => void;
};

interface SocketData {
  userId: string;
  sessionId: string;
}

type TypedServer = Server<
  Record<string, never>,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Gateway realtime duy nhất của app.
 * - Handshake auth bằng cookie `access_token` (parse thủ công).
 * - Mỗi client join `user:{userId}` + `session:{sessionId}`;
 *   ai có `audit:read` join thêm `room:audit`.
 * - Nhận event nội bộ (EventEmitter2) từ các service và emit đúng room —
 *   tên event/payload type theo `SocketEvents` của @repo/shared.
 */
@WebSocketGateway()
export class EventsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: TypedServer;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly permsCache: PermissionsCacheService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const cookies = parseCookieHeader(socket.handshake.headers.cookie);
      const token =
        cookies['access_token'] ??
        (typeof socket.handshake.auth['token'] === 'string'
          ? socket.handshake.auth['token']
          : undefined);
      if (!token) throw new Error('missing token');

      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwtAccessSecret,
      });
      if (payload.typ !== 'access') throw new Error('wrong token type');

      (socket.data as SocketData).userId = payload.sub;
      (socket.data as SocketData).sessionId = payload.sessionId;

      await socket.join([
        SOCKET_ROOMS.user(payload.sub),
        SOCKET_ROOMS.session(payload.sessionId),
      ]);

      const access = await this.permsCache.getUserAccess(payload.sub);
      if (access?.permissions.includes(PERMISSIONS.AUDIT_READ)) {
        // Platform admin (orgId=null) → room toàn cục; org admin → room org mình
        await socket.join(
          payload.orgId ? SOCKET_ROOMS.auditOrg(payload.orgId) : SOCKET_ROOMS.audit,
        );
      }
    } catch {
      // Không leak lý do từ chối — đóng kết nối là đủ
      socket.disconnect(true);
    }
  }

  /** Emit typed — compile error nếu sai tên event/payload. */
  emitTo<E extends SocketEventName>(
    room: string,
    event: E,
    payload: SocketEvents[E],
  ): void {
    this.server.to(room).emit(event, ...([payload] as Parameters<ServerToClientEvents[E]>));
  }

  @OnEvent(APP_EVENTS.SESSION_REVOKED)
  onSessionRevoked(event: SessionRevokedEvent): void {
    this.emitTo(SOCKET_ROOMS.session(event.sessionId), 'session:revoked', {
      sessionId: event.sessionId,
      reason: event.reason,
    });
  }

  @OnEvent(APP_EVENTS.FORCE_LOGOUT)
  onForceLogout(event: ForceLogoutEvent): void {
    this.emitTo(SOCKET_ROOMS.user(event.userId), 'force:logout', {
      reason: event.reason,
    });
  }

  @OnEvent(APP_EVENTS.USER_UPDATED)
  onUserUpdated(event: UserUpdatedEvent): void {
    this.emitTo(SOCKET_ROOMS.user(event.userId), 'user:updated', {
      userId: event.userId,
      reason: event.reason,
    });
  }

  @OnEvent(APP_EVENTS.NOTIFY)
  onNotify(event: NotifyEvent): void {
    this.emitTo(SOCKET_ROOMS.user(event.userId), 'notification:new', event.notification);
  }

  @OnEvent(APP_EVENTS.APPROVAL_CHANGED)
  onApprovalChanged(event: ApprovalChangedEvent): void {
    const payload = {
      targetType: event.targetType,
      targetId: event.targetId,
      status: event.status,
    };
    for (const userId of new Set(event.userIds)) {
      this.emitTo(SOCKET_ROOMS.user(userId), 'approval:changed', payload);
    }
  }

  @OnEvent(APP_EVENTS.AUDIT_CREATED)
  onAuditCreated(event: AuditCreatedEvent): void {
    // Platform admin (room toàn cục) thấy mọi log; org admin chỉ room org của log.
    this.emitTo(SOCKET_ROOMS.audit, 'audit:created', event);
    if (event.orgId) {
      this.emitTo(SOCKET_ROOMS.auditOrg(event.orgId), 'audit:created', event);
    }
  }
}
