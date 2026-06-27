import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { EmployeesModule } from '../employees/employees.module';
import { NotificationModule } from '../notification/notification.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { KpiDefinitionsController } from './kpi-definitions.controller';
import { KpiDefinitionsService } from './kpi-definitions.service';
import { PerformanceReviewsController } from './performance-reviews.controller';
import { PerformanceReviewsService } from './performance-reviews.service';
import { ReviewCyclesController } from './review-cycles.controller';
import { ReviewCyclesService } from './review-cycles.service';

/** P-D — Hiệu suất: chu kỳ + thư viện KPI + mục tiêu + đánh giá (+ 360° dần). */
@Module({
  imports: [EmployeesModule, ApprovalModule, NotificationModule],
  controllers: [
    ReviewCyclesController,
    KpiDefinitionsController,
    GoalsController,
    PerformanceReviewsController,
  ],
  providers: [
    ReviewCyclesService,
    KpiDefinitionsService,
    GoalsService,
    PerformanceReviewsService,
  ],
})
export class PerformanceModule {}
