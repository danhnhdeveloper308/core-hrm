import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Phase 9 — Dashboard số liệu + xuất báo cáo XLSX. */
@Module({
  imports: [AttendanceModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
