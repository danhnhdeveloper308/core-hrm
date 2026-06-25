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
import { AppConfigService } from '../config/app-config.service';
import { MailService, type OtpMailKind } from '../mail/mail.service';
import { redisConnectionOptions } from '../redis/redis.module';

export const EMAIL_QUEUE = 'EMAIL_QUEUE';
export const EMAIL_QUEUE_NAME = 'email';

export const EMAIL_JOBS = {
  SEND_OTP: 'email.send-otp',
  NEW_DEVICE_ALERT: 'email.new-device-alert',
  INVITE: 'email.invite',
  NOTIFICATION: 'email.notification',
} as const;

export interface SendOtpJobData {
  to: string;
  code: string;
  kind: OtpMailKind;
}

export interface NewDeviceAlertJobData {
  to: string;
  deviceName: string;
  ip: string | null;
  time: string;
}

export interface InviteJobData {
  to: string;
  inviterEmail: string;
  link: string;
}

export interface NotificationEmailJobData {
  to: string;
  title: string;
  body: string;
  link: string | null;
}

/** Producer — các module khác chỉ gọi service này, không đụng Queue trực tiếp. */
@Injectable()
export class EmailQueueService {
  constructor(@Inject(EMAIL_QUEUE) private readonly queue: Queue) {}

  async enqueueOtp(data: SendOtpJobData): Promise<void> {
    await this.queue.add(EMAIL_JOBS.SEND_OTP, data);
  }

  async enqueueNewDeviceAlert(data: NewDeviceAlertJobData): Promise<void> {
    await this.queue.add(EMAIL_JOBS.NEW_DEVICE_ALERT, data);
  }

  async enqueueInvite(data: InviteJobData): Promise<void> {
    await this.queue.add(EMAIL_JOBS.INVITE, data);
  }

  async enqueueNotification(data: NotificationEmailJobData): Promise<void> {
    await this.queue.add(EMAIL_JOBS.NOTIFICATION, data);
  }
}

/** Consumer — chạy trong cùng process API. */
@Injectable()
export class EmailQueueWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(EmailQueueWorker.name);
  private worker: Worker | undefined;

  constructor(
    private readonly config: AppConfigService,
    private readonly mail: MailService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      EMAIL_QUEUE_NAME,
      async (job) => {
        switch (job.name) {
          case EMAIL_JOBS.SEND_OTP: {
            const data = job.data as SendOtpJobData;
            await this.mail.sendOtp(data.to, data.code, data.kind);
            break;
          }
          case EMAIL_JOBS.NEW_DEVICE_ALERT:
            await this.mail.sendNewDeviceAlert(job.data as NewDeviceAlertJobData);
            break;
          case EMAIL_JOBS.INVITE:
            await this.mail.sendInvite(job.data as InviteJobData);
            break;
          case EMAIL_JOBS.NOTIFICATION:
            await this.mail.sendNotification(job.data as NotificationEmailJobData);
            break;
        }
      },
      {
        // BullMQ yêu cầu maxRetriesPerRequest: null cho worker connection
        connection: {
          ...redisConnectionOptions(this.config),
          maxRetriesPerRequest: null,
        },
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Job ${job?.name ?? '?'} (${job?.id ?? '?'}) thất bại: ${error.message}`,
      );
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
      provide: EMAIL_QUEUE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Queue(EMAIL_QUEUE_NAME, {
          connection: redisConnectionOptions(config),
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: 100,
            removeOnFail: 1_000,
          },
        }),
    },
    EmailQueueService,
    EmailQueueWorker,
  ],
  exports: [EmailQueueService],
})
export class EmailQueueModule implements OnApplicationShutdown {
  constructor(@Inject(EMAIL_QUEUE) private readonly queue: Queue) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
