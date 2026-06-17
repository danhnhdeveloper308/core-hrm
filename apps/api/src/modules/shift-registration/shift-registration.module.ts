import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { ShiftRegistrationController } from './shift-registration.controller';
import { ShiftRegistrationService } from './shift-registration.service';

/** AttendanceModule export TimesheetService; ApprovalModule export ApprovalService. */
@Module({
  imports: [ApprovalModule, AttendanceModule],
  controllers: [ShiftRegistrationController],
  providers: [ShiftRegistrationService],
})
export class ShiftRegistrationModule {}
