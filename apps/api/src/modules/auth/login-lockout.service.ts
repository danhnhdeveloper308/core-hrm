import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ERROR_CODES } from '@repo/shared';
import type Redis from 'ioredis';
import {
  APP_EVENTS,
  type AuditRecordEvent,
} from '../../common/events/app.events';
import { AppException } from '../../common/exceptions/app.exception';
import { REDIS_CLIENT } from '../../redis/redis.module';

const MAX_FAILURES = 10;
const WINDOW_SECONDS = 900; // 15 phút

const failKey = (email: string) => `lockout:fail:${email}`;
const lockKey = (email: string) => `lockout:lock:${email}`;

/**
 * Khoá tài khoản tạm thời theo EMAIL (không phải IP) — chống brute-force
 * phân tán mà throttler per-IP không bắt được: sai quá 10 lần trong 15 phút
 * → khoá 15 phút. Đếm cả mật khẩu sai lẫn mã 2FA sai.
 */
@Injectable()
export class LoginLockoutService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly events: EventEmitter2,
  ) {}

  async assertNotLocked(email: string | null): Promise<void> {
    if (!email) return;
    if (await this.redis.exists(lockKey(email))) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'Tài khoản tạm khoá do nhập sai quá nhiều — thử lại sau 15 phút',
        ERROR_CODES.AUTH_ACCOUNT_LOCKED,
      );
    }
  }

  /** Gọi mỗi lần sai mật khẩu / sai mã 2FA. */
  async registerFailure(
    email: string | null,
    ctx: { ip?: string | undefined; userAgent?: string | undefined } = {},
  ): Promise<void> {
    if (!email) return;
    const failures = await this.redis.incr(failKey(email));
    await this.redis.expire(failKey(email), WINDOW_SECONDS);

    if (failures >= MAX_FAILURES) {
      await this.redis.set(lockKey(email), '1', 'EX', WINDOW_SECONDS);
      this.events.emit(APP_EVENTS.AUDIT_RECORD, {
        actorEmail: email,
        action: 'auth.account_locked',
        resource: 'user',
        metadata: { failures, windowSeconds: WINDOW_SECONDS },
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      } satisfies AuditRecordEvent);
    }
  }

  /** Đăng nhập thành công → xoá bộ đếm. */
  async reset(email: string | null): Promise<void> {
    if (!email) return;
    await this.redis.del(failKey(email), lockKey(email));
  }
}
