import { Module } from '@nestjs/common';
import { KpiDefinitionsController } from './kpi-definitions.controller';
import { KpiDefinitionsService } from './kpi-definitions.service';
import { ReviewCyclesController } from './review-cycles.controller';
import { ReviewCyclesService } from './review-cycles.service';

/** P-D — Hiệu suất: chu kỳ đánh giá + thư viện KPI (+ mục tiêu/đánh giá/360° dần). */
@Module({
  controllers: [ReviewCyclesController, KpiDefinitionsController],
  providers: [ReviewCyclesService, KpiDefinitionsService],
})
export class PerformanceModule {}
