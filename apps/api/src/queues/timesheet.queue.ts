import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../config/app-config.service';
import { redisConnectionOptions } from '../redis/redis.module';

export const TIMESHEET_QUEUE = 'TIMESHEET_QUEUE';
export const TIMESHEET_QUEUE_NAME = 'timesheet-recalc';
export const TIMESHEET_RECALC_JOB = 'timesheet.recalc';

export interface TimesheetRecalcJob {
  orgId: string;
  employeeId: string;
  date: string; // "YYYY-MM-DD" giờ địa phương
}

/**
 * Producer: mọi thay đổi (log mới, sửa công, đổi ca, nghỉ phép) đẩy job vào đây.
 * Worker tiêu thụ nằm trong AttendanceModule (cần TimesheetService) — tránh
 * vòng phụ thuộc module.
 */
@Injectable()
export class TimesheetQueueService {
  private readonly logger = new Logger(TimesheetQueueService.name);

  constructor(@Inject(TIMESHEET_QUEUE) private readonly queue: Queue) {}

  async enqueueRecalc(job: TimesheetRecalcJob): Promise<void> {
    try {
      // KHÔNG đặt jobId tĩnh: BullMQ dedup theo jobId kể cả job đã completed
      // (giữ trong removeOnComplete) → recalc chỉ chạy 1 lần/ngày rồi kẹt.
      // recalc idempotent (đọc lại toàn bộ log) nên enqueue mỗi lần là an toàn.
      await this.queue.add(TIMESHEET_RECALC_JOB, job);
    } catch (error) {
      this.logger.error(`Không đẩy được timesheet recalc job: ${String(error)}`);
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: TIMESHEET_QUEUE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Queue(TIMESHEET_QUEUE_NAME, {
          connection: redisConnectionOptions(config),
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1_000 },
            removeOnComplete: 1_000,
            removeOnFail: 5_000,
          },
        }),
    },
    TimesheetQueueService,
  ],
  exports: [TimesheetQueueService],
})
export class TimesheetQueueModule implements OnApplicationShutdown {
  constructor(@Inject(TIMESHEET_QUEUE) private readonly queue: Queue) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
