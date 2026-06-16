import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { EmployeesModule } from '../employees/employees.module';
import { FaceModule } from '../face/face.module';
import { WorkScheduleModule } from '../schedule/schedule.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { TimesheetRecalcWorker } from './timesheet-recalc.worker';
import { TimesheetService } from './timesheet.service';

@Module({
  imports: [WorkScheduleModule, EmployeesModule, FaceModule, ApprovalModule],
  controllers: [AttendanceController],
  providers: [TimesheetService, AttendanceService, TimesheetRecalcWorker],
  exports: [TimesheetService, AttendanceService],
})
export class AttendanceModule {}
