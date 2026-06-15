import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { redisConnectionOptions } from '../../redis/redis.module';
import {
  TIMESHEET_QUEUE_NAME,
  type TimesheetRecalcJob,
} from '../../queues/timesheet.queue';
import { TimesheetService } from './timesheet.service';

/** Consumer queue `timesheet-recalc` — gọi TimesheetService.recalc. */
@Injectable()
export class TimesheetRecalcWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TimesheetRecalcWorker.name);
  private worker: Worker | undefined;

  constructor(
    private readonly config: AppConfigService,
    private readonly timesheet: TimesheetService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<TimesheetRecalcJob>(
      TIMESHEET_QUEUE_NAME,
      async (job) => {
        await this.timesheet.recalc(
          job.data.orgId,
          job.data.employeeId,
          job.data.date,
        );
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
        `Timesheet recalc thất bại (job ${job?.id ?? '?'}): ${error.message}`,
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
