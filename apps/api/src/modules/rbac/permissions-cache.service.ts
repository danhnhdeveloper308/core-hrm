import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Permission, UserStatus } from '@repo/shared';
import type Redis from 'ioredis';
import {
  APP_EVENTS,
  type UserUpdatedEvent,
} from '../../common/events/app.events';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.module';

const CACHE_TTL_SECONDS = 60;

const cacheKey = (userId: string) => `perms:${userId}`;

export interface CachedUserAccess {
  status: UserStatus;
  permissions: Permission[];
}

/**
 * Cache Redis `perms:{userId}` TTL 60s cho PermissionsGuard.
 * Mọi thay đổi role/permission/status PHẢI gọi invalidate* tương ứng —
 * các hàm này đồng thời emit `user:updated` để FE refetch.
 */
@Injectable()
export class PermissionsCacheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getUserAccess(userId: string): Promise<CachedUserAccess | null> {
    const cached = await this.redis.get(cacheKey(userId));
    if (cached) return JSON.parse(cached) as CachedUserAccess;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        roles: {
          select: {
            role: {
              select: {
                permissions: { select: { permission: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!user) return null;

    const permissions = [
      ...new Set(
        user.roles.flatMap((ur) =>
          ur.role.permissions.map((rp) => rp.permission.name as Permission),
        ),
      ),
    ].sort();

    const access: CachedUserAccess = { status: user.status, permissions };
    await this.redis.set(
      cacheKey(userId),
      JSON.stringify(access),
      'EX',
      CACHE_TTL_SECONDS,
    );
    return access;
  }

  /** Xoá cache 1 user + báo FE refetch. */
  async invalidateUser(
    userId: string,
    reason: UserUpdatedEvent['reason'],
  ): Promise<void> {
    await this.redis.del(cacheKey(userId));
    this.events.emit(APP_EVENTS.USER_UPDATED, {
      userId,
      reason,
    } satisfies UserUpdatedEvent);
  }

  /** Xoá cache mọi user đang giữ role — dùng khi đổi permissions của role. */
  async invalidateRole(roleId: string): Promise<string[]> {
    const users = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    const userIds = users.map((u) => u.userId);
    if (userIds.length > 0) {
      await this.redis.del(userIds.map(cacheKey));
      for (const userId of userIds) {
        this.events.emit(APP_EVENTS.USER_UPDATED, {
          userId,
          reason: 'permissions',
        } satisfies UserUpdatedEvent);
      }
    }
    return userIds;
  }
}
