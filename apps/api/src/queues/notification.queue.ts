import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { redisConnectionOptions } from '../redis/redis.module';

export const NOTIFICATION_QUEUE = 'NOTIFICATION_QUEUE';
export const NOTIFICATION_QUEUE_NAME = 'notification-push';
const PUSH_JOB = 'notification.push';

export interface PushJobData {
  /** FCM registration token của thiết bị người nhận. */
  tokens: string[];
  title: string;
  body: string;
  /** Deep-link khi click (web: webpush fcmOptions.link). */
  link?: string | null;
  /** Payload phụ — FCM yêu cầu mọi value là string. */
  data?: Record<string, string>;
}

/** Producer — NotificationService gọi để đẩy push (không block request). */
@Injectable()
export class NotificationPushQueueService {
  private readonly logger = new Logger(NotificationPushQueueService.name);

  constructor(@Inject(NOTIFICATION_QUEUE) private readonly queue: Queue) {}

  async enqueue(data: PushJobData): Promise<void> {
    if (data.tokens.length === 0) return;
    try {
      await this.queue.add(PUSH_JOB, data);
    } catch (error) {
      // Push lỗi không được làm hỏng luồng chính (in-app vẫn hoạt động)
      this.logger.error(`Không đẩy được push job: ${String(error)}`);
    }
  }
}

/** Consumer — gửi FCM multicast, prune token chết. No-op nếu chưa cấu hình Firebase. */
@Injectable()
export class NotificationPushWorker
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationPushWorker.name);
  private worker: Worker | undefined;
  private messaging: Messaging | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const fb = this.config.firebaseAdmin;
    if (!fb) {
      this.logger.warn('Chưa cấu hình FIREBASE_* → tắt FCM push (chỉ in-app/socket)');
      return;
    }
    const app =
      getApps().find((a) => a.name === 'hrm') ??
      initializeApp({ credential: cert(fb) }, 'hrm');
    this.messaging = getMessaging(app);

    this.worker = new Worker<PushJobData>(
      NOTIFICATION_QUEUE_NAME,
      async (job) => this.handle(job.data),
      {
        connection: {
          ...redisConnectionOptions(this.config),
          maxRetriesPerRequest: null,
        },
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Gửi push thất bại (job ${job?.id ?? '?'}): ${error.message}`);
    });
  }

  private async handle(data: PushJobData): Promise<void> {
    if (!this.messaging) return;
    const res = await this.messaging.sendEachForMulticast({
      tokens: data.tokens,
      notification: { title: data.title, body: data.body },
      ...(data.link ? { webpush: { fcmOptions: { link: data.link } } } : {}),
      ...(data.data ? { data: data.data } : {}),
    });

    // Prune token không còn hợp lệ để lần sau không gửi lại
    const dead: string[] = [];
    res.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        const token = data.tokens[i];
        if (token) dead.push(token);
      }
    });
    if (dead.length > 0) {
      await this.prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
      this.logger.log(`Đã gỡ ${dead.length} FCM token chết`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: NOTIFICATION_QUEUE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Queue(NOTIFICATION_QUEUE_NAME, {
          connection: redisConnectionOptions(config),
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: 1_000,
            removeOnFail: 5_000,
          },
        }),
    },
    NotificationPushQueueService,
    NotificationPushWorker,
  ],
  exports: [NotificationPushQueueService],
})
export class NotificationQueueModule implements OnApplicationShutdown {
  constructor(@Inject(NOTIFICATION_QUEUE) private readonly queue: Queue) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
