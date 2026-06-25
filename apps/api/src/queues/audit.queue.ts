import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { AuditLog } from '@repo/shared';
import { Queue, Worker } from 'bullmq';
import {
  APP_EVENTS,
  type AuditRecordEvent,
} from '../common/events/app.events';
import { redactSensitive } from '../common/utils/redact';
import { AppConfigService } from '../config/app-config.service';
import type { Prisma } from '../generated/prisma/client';
import type { AuditLog as AuditLogRow } from '../prisma/prisma.types';
import { PrismaService } from '../prisma/prisma.service';
import { redisConnectionOptions } from '../redis/redis.module';

export const AUDIT_QUEUE = 'AUDIT_QUEUE';
export const AUDIT_QUEUE_NAME = 'audit';
const AUDIT_JOB = 'audit.write';

export function toAuditLogResponse(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    orgId: row.orgId,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    action: row.action,
    resource: row.resource,
    resourceId: row.resourceId,
    ip: row.ip,
    userAgent: row.userAgent,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Producer: nhận event AUDIT_RECORD từ mọi service, redact metadata rồi
 * đẩy vào queue — request không bao giờ chờ ghi DB.
 */
@Injectable()
export class AuditQueueService {
  private readonly logger = new Logger(AuditQueueService.name);

  constructor(@Inject(AUDIT_QUEUE) private readonly queue: Queue) {}

  @OnEvent(APP_EVENTS.AUDIT_RECORD)
  async onAuditRecord(event: AuditRecordEvent): Promise<void> {
    try {
      await this.queue.add(AUDIT_JOB, {
        ...event,
        metadata: event.metadata
          ? (redactSensitive(event.metadata) as Record<string, unknown>)
          : null,
      });
    } catch (error) {
      // Audit không được làm hỏng request chính
      this.logger.error(`Không đẩy được audit job: ${String(error)}`);
    }
  }
}

/** Consumer: ghi DB xong emit AUDIT_CREATED để gateway bắn realtime. */
@Injectable()
export class AuditQueueWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AuditQueueWorker.name);
  private worker: Worker | undefined;

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<AuditRecordEvent>(
      AUDIT_QUEUE_NAME,
      async (job) => {
        const data = job.data;
        const row = await this.prisma.auditLog.create({
          data: {
            orgId: data.orgId ?? null,
            actorId: data.actorId ?? null,
            actorEmail: data.actorEmail ?? null,
            action: data.action,
            resource: data.resource,
            resourceId: data.resourceId ?? null,
            ip: data.ip ?? null,
            userAgent: data.userAgent ?? null,
            // metadata đã qua redactSensitive → JSON-safe
            metadata: (data.metadata as Prisma.InputJsonValue | null) ?? undefined,
          },
        });
        this.events.emit(APP_EVENTS.AUDIT_CREATED, toAuditLogResponse(row));
      },
      {
        connection: {
          ...redisConnectionOptions(this.config),
          maxRetriesPerRequest: null,
        },
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Ghi audit thất bại (job ${job?.id ?? '?'}): ${error.message}`);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: AUDIT_QUEUE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Queue(AUDIT_QUEUE_NAME, {
          connection: redisConnectionOptions(config),
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: 1_000,
            removeOnFail: 5_000,
          },
        }),
    },
    AuditQueueService,
    AuditQueueWorker,
  ],
  exports: [AuditQueueService],
})
export class AuditQueueModule implements OnApplicationShutdown {
  constructor(@Inject(AUDIT_QUEUE) private readonly queue: Queue) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
