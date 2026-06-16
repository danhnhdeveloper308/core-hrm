import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { EmployeesModule } from '../employees/employees.module';
import { WorkScheduleModule } from '../schedule/schedule.module';
import { LeaveConfigService } from './leave-config.service';
import { LeaveConfigController, LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [ApprovalModule, EmployeesModule, WorkScheduleModule],
  controllers: [LeaveConfigController, LeaveController],
  providers: [LeaveService, LeaveConfigService],
  exports: [LeaveService],
})
export class LeaveModule {}
