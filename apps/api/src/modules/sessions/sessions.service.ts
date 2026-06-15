import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ERROR_CODES,
  PERMISSIONS,
  type SessionResponse,
  type SessionRevokeReason,
} from '@repo/shared';
import type Redis from 'ioredis';
import { AppException } from '../../common/exceptions/app.exception';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { PermissionsCacheService } from '../rbac/permissions-cache.service';
import {
  APP_EVENTS,
  type ForceLogoutEvent,
  type SessionRevokedEvent,
} from '../../common/events/app.events';
import { generateRefreshToken, sha256 } from '../../common/utils/crypto';
import { parseUserAgent } from '../../common/utils/user-agent';
import { AppConfigService } from '../../config/app-config.service';
import type { Session, User } from '../../prisma/prisma.types';
import { PrismaService } from '../../prisma/prisma.service';

export interface RequestContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export type SessionWithUser = Session & { user: User };

/**
 * Cơ chế session/refresh-token: DB là single source of truth.
 * Raw refresh token không bao giờ được lưu — chỉ lưu sha256 hash.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly events: EventEmitter2,
    private readonly permsCache: PermissionsCacheService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Access token JWT vẫn "hợp lệ" tới 15 phút sau khi session bị revoke —
   * blocklist sessionId trong Redis (TTL = access TTL + đệm) để JwtAuthGuard
   * chặn NGAY các request dùng token của phiên đã thu hồi.
   */
  private async blocklistSessions(sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    const ttlSeconds = Math.ceil(this.config.accessTokenTtlMs / 1_000) + 60;
    const pipeline = this.redis.pipeline();
    for (const id of sessionIds) {
      pipeline.set(`revoked:${id}`, '1', 'EX', ttlSeconds);
    }
    await pipeline.exec();
  }

  async createSession(
    userId: string,
    ctx: RequestContext,
  ): Promise<{ session: Session; refreshToken: string; isNewDevice: boolean }> {
    const { deviceName, fingerprint } = parseUserAgent(ctx.userAgent);

    const existing = await this.prisma.device.findUnique({
      where: { userId_fingerprint: { userId, fingerprint } },
    });
    const device = existing
      ? await this.prisma.device.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date(), name: deviceName },
        })
      : await this.prisma.device.create({
          data: { userId, fingerprint, name: deviceName },
        });

    const refreshToken = generateRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: sha256(refreshToken),
        deviceId: device.id,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        expiresAt: new Date(Date.now() + this.config.refreshTokenTtlMs),
      },
    });

    return { session, refreshToken, isNewDevice: !existing };
  }

  // ---------------- Trusted device ("ghi nhớ thiết bị" skip 2FA) ----------------

  /** Đánh dấu thiết bị hiện tại tin cậy 30 ngày — lưu hash của token cookie. */
  async trustDevice(
    userId: string,
    ctx: RequestContext,
    rawToken: string,
  ): Promise<void> {
    const { deviceName, fingerprint } = parseUserAgent(ctx.userAgent);
    const data = {
      trusted: true,
      trustedTokenHash: sha256(rawToken),
      trustedUntil: new Date(Date.now() + 30 * 86_400_000),
      lastSeenAt: new Date(),
    };
    await this.prisma.device.upsert({
      where: { userId_fingerprint: { userId, fingerprint } },
      update: data,
      create: { userId, fingerprint, name: deviceName, ...data },
    });
  }

  async isTrustedDevice(userId: string, rawToken: string): Promise<boolean> {
    const device = await this.prisma.device.findFirst({
      where: {
        userId,
        trustedTokenHash: sha256(rawToken),
        trustedUntil: { gt: new Date() },
      },
      select: { id: true },
    });
    return device !== null;
  }

  /** Thu hồi mọi thiết bị tin cậy — gọi khi tắt 2FA / reset mật khẩu. */
  async revokeTrustedDevices(userId: string): Promise<void> {
    await this.prisma.device.updateMany({
      where: { userId, trustedTokenHash: { not: null } },
      data: { trusted: false, trustedTokenHash: null, trustedUntil: null },
    });
  }

  /** Số thiết bị đã biết của user — dùng để bỏ qua cảnh báo ở thiết bị đầu tiên. */
  countDevices(userId: string): Promise<number> {
    return this.prisma.device.count({ where: { userId } });
  }

  findByRefreshToken(refreshToken: string): Promise<SessionWithUser | null> {
    return this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
      include: { user: true },
    });
  }

  findById(sessionId: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { id: sessionId } });
  }

  /**
   * Rotation: revoke session cũ (ROTATED — không emit socket, client này vẫn
   * đang hoạt động) rồi tạo session mới.
   */
  async rotate(
    oldSession: Session,
    ctx: RequestContext,
  ): Promise<{ session: Session; refreshToken: string }> {
    await this.revokeSession(oldSession.id, 'ROTATED', { emit: false });
    return this.createSession(oldSession.userId, ctx);
  }

  /** Revoke 1 session. emit=true → bắn `session:revoked` cho client đó tự logout. */
  async revokeSession(
    sessionId: string,
    reason: SessionRevokeReason,
    options: { emit: boolean },
  ): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    if (result.count === 0) return;

    await this.blocklistSessions([sessionId]);
    if (!options.emit) return;

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (session) {
      this.events.emit(APP_EVENTS.SESSION_REVOKED, {
        userId: session.userId,
        sessionId,
        reason,
      } satisfies SessionRevokedEvent);
    }
  }

  /**
   * Revoke mọi session đang hoạt động của user.
   * - `exceptSessionId`: giữ lại session hiện tại (vd "logout thiết bị khác") —
   *   emit `session:revoked` từng cái thay vì `force:logout` cả user.
   * - `forceLogout`: bắn `force:logout` tới mọi client của user (ban, token reuse...).
   */
  async revokeAllForUser(
    userId: string,
    reason: SessionRevokeReason,
    options: { exceptSessionId?: string; forceLogout?: boolean } = {},
  ): Promise<number> {
    const where = {
      userId,
      revokedAt: null,
      ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
    };

    const affected = await this.prisma.session.findMany({
      where,
      select: { id: true },
    });
    if (affected.length === 0) return 0;

    await this.prisma.session.updateMany({
      where,
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.blocklistSessions(affected.map((s) => s.id));

    if (options.forceLogout) {
      this.events.emit(APP_EVENTS.FORCE_LOGOUT, {
        userId,
        reason,
      } satisfies ForceLogoutEvent);
    } else {
      for (const { id } of affected) {
        this.events.emit(APP_EVENTS.SESSION_REVOKED, {
          userId,
          sessionId: id,
          reason,
        } satisfies SessionRevokedEvent);
      }
    }

    return affected.length;
  }

  // ---------------- API cho sessions controller ----------------

  /** Danh sách session đang hoạt động của 1 user (hiển thị ở /dashboard/security). */
  async listActiveSessions(
    userId: string,
    currentSessionId: string | null,
  ): Promise<SessionResponse[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { device: true },
      orderBy: { lastActiveAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      deviceName: s.device?.name ?? null,
      ip: s.ip,
      userAgent: s.userAgent,
      lastActiveAt: s.lastActiveAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isCurrent: s.id === currentSessionId,
    }));
  }

  /**
   * Revoke 1 session theo yêu cầu: chủ session luôn được phép,
   * người khác phải có permission `session:revoke`.
   */
  async revokeOnBehalf(
    actor: { sub: string },
    sessionId: string,
  ): Promise<{ message: string }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (!session || session.revokedAt) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Session không tồn tại hoặc đã bị thu hồi',
        ERROR_CODES.NOT_FOUND,
      );
    }

    const isOwner = session.userId === actor.sub;
    if (!isOwner) {
      const access = await this.permsCache.getUserAccess(actor.sub);
      if (!access?.permissions.includes(PERMISSIONS.SESSION_REVOKE)) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'Không đủ quyền thu hồi session của người khác',
          ERROR_CODES.FORBIDDEN,
        );
      }
    }

    await this.revokeSession(
      sessionId,
      isOwner ? 'USER_LOGOUT' : 'ADMIN_REVOKED',
      { emit: true },
    );
    return { message: 'Đã thu hồi session' };
  }

  /** Cron 3h sáng: dọn session đã hết hạn quá 7 ngày (giữ lại phục vụ reuse detection). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredSessions(): Promise<void> {
    const threshold = new Date(Date.now() - 7 * 86_400_000);
    const { count } = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: threshold } },
    });
    if (count > 0) {
      this.logger.log(`Đã dọn ${count} session hết hạn`);
    }
  }
}
