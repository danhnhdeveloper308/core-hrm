import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type Redis from 'ioredis';
import type { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.module';

/**
 * Cập nhật Session.lastActiveAt — throttle 60s/session bằng Redis SET NX
 * để không spam DB. Fire-and-forget, không bao giờ block request.
 */
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityInterceptor.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest<Request>();
      const sessionId = request.user?.sessionId;
      if (sessionId) void this.touch(sessionId);
    }
    return next.handle();
  }

  private async touch(sessionId: string): Promise<void> {
    try {
      const acquired = await this.redis.set(
        `active:${sessionId}`,
        '1',
        'EX',
        60,
        'NX',
      );
      if (acquired) {
        await this.prisma.session.updateMany({
          where: { id: sessionId, revokedAt: null },
          data: { lastActiveAt: new Date() },
        });
      }
    } catch (error) {
      this.logger.debug(`Bỏ qua cập nhật lastActiveAt: ${String(error)}`);
    }
  }
}
