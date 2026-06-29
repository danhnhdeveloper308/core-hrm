import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import {
  PAYROLL_QUEUE_NAME,
  type PayrollCalcJob,
} from '../../queues/payroll.queue';
import { redisConnectionOptions } from '../../redis/redis.module';
import { PayrollCalcService } from './payroll-calc.service';

/** Consumer queue `payroll-calc` — gọi PayrollCalcService.calculateRun. */
@Injectable()
export class PayrollCalcWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PayrollCalcWorker.name);
  private worker: Worker | undefined;

  constructor(
    private readonly config: AppConfigService,
    private readonly calc: PayrollCalcService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<PayrollCalcJob>(
      PAYROLL_QUEUE_NAME,
      async (job) => {
        await this.calc.calculateRun(job.data.orgId, job.data.runId);
      },
      {
        connection: {
          ...redisConnectionOptions(this.config),
          maxRetriesPerRequest: null,
        },
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Tính lương thất bại (job ${job?.id ?? '?'}): ${error.message}`,
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
