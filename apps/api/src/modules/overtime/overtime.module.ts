import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { OvertimeController } from './overtime.controller';
import { OvertimeService } from './overtime.service';

/** P-A.9 — Quản trị tăng ca: trần OT + tổng hợp giờ OT theo tháng/đơn vị. */
@Module({
  imports: [EmployeesModule],
  controllers: [OvertimeController],
  providers: [OvertimeService],
})
export class OvertimeModule {}
