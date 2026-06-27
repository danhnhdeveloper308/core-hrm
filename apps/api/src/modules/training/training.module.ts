import { Module } from '@nestjs/common';
import { TrainingCoursesController } from './training-courses.controller';
import { TrainingCoursesService } from './training-courses.service';

/** P-E — Đào tạo: danh mục khoá (+ lớp/đăng ký + chứng chỉ dần). */
@Module({
  controllers: [TrainingCoursesController],
  providers: [TrainingCoursesService],
})
export class TrainingModule {}
