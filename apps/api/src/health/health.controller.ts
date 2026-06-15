import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ERROR_CODES } from '@repo/shared';
import type Redis from 'ioredis';
import { Public } from '../common/decorators/public.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';

type DependencyStatus = 'up' | 'down';

/** Timeout 2s — health check không được treo theo dependency. */
function withTimeout(probe: Promise<unknown>): Promise<DependencyStatus> {
  return Promise.race([
    probe.then((): DependencyStatus => 'up'),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2_000)),
  ]).catch((): DependencyStatus => 'down');
}

/** Healthcheck cho docker/loadbalancer — nằm ngoài global prefix. */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Healthcheck — ping cả Postgres + Redis' })
  @ApiOkResponse({ description: 'Service + dependencies đang chạy (503 nếu degraded)' })
  async check(): Promise<{
    status: 'ok';
    db: DependencyStatus;
    redis: DependencyStatus;
    timestamp: string;
  }> {
    const [db, redis] = await Promise.all([
      withTimeout(this.prisma.$queryRaw`SELECT 1`),
      withTimeout(this.redis.ping()),
    ]);

    if (db === 'down' || redis === 'down') {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Service degraded',
        ERROR_CODES.INTERNAL_ERROR,
        { db, redis },
      );
    }

    return { status: 'ok', db, redis, timestamp: new Date().toISOString() };
  }
}
