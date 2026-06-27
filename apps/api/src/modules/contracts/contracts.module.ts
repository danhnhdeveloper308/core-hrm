import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { NotificationModule } from '../notification/notification.module';
import { ContractReminderService } from './contract-reminder.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

/** P-B — Quản lý hợp đồng lao động: danh sách/CRUD + cron nhắc hết hạn. */
@Module({
  imports: [EmployeesModule, NotificationModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractReminderService],
})
export class ContractsModule {}
