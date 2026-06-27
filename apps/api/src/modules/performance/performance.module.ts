import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { KpiDefinitionsController } from './kpi-definitions.controller';
import { KpiDefinitionsService } from './kpi-definitions.service';
import { ReviewCyclesController } from './review-cycles.controller';
import { ReviewCyclesService } from './review-cycles.service';

/** P-D — Hiệu suất: chu kỳ đánh giá + thư viện KPI + mục tiêu (+ đánh giá/360° dần). */
@Module({
  imports: [EmployeesModule],
  controllers: [
    ReviewCyclesController,
    KpiDefinitionsController,
    GoalsController,
  ],
  providers: [ReviewCyclesService, KpiDefinitionsService, GoalsService],
})
export class PerformanceModule {}
