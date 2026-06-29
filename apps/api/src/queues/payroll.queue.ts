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

export const PAYROLL_QUEUE = 'PAYROLL_QUEUE';
export const PAYROLL_QUEUE_NAME = 'payroll-calc';
export const PAYROLL_CALC_JOB = 'payroll.calc';

export interface PayrollCalcJob {
  orgId: string;
  runId: string;
}

/**
 * Producer queue tính lương hàng loạt. Worker (PayrollCalcWorker trong
 * PayrollModule) tiêu thụ — tránh vòng phụ thuộc module.
 */
@Injectable()
export class PayrollQueueService {
  private readonly logger = new Logger(PayrollQueueService.name);

  constructor(@Inject(PAYROLL_QUEUE) private readonly queue: Queue) {}

  async enqueueCalc(job: PayrollCalcJob): Promise<void> {
    // jobId theo runId → chống enqueue trùng khi đang xử lý 1 kỳ.
    await this.queue.add(PAYROLL_CALC_JOB, job, { jobId: `calc:${job.runId}` });
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PAYROLL_QUEUE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Queue(PAYROLL_QUEUE_NAME, {
          connection: redisConnectionOptions(config),
          defaultJobOptions: {
            attempts: 2,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: 500,
            removeOnFail: 1_000,
          },
        }),
    },
    PayrollQueueService,
  ],
  exports: [PayrollQueueService],
})
export class PayrollQueueModule implements OnApplicationShutdown {
  constructor(@Inject(PAYROLL_QUEUE) private readonly queue: Queue) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
