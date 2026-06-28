import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { EmployeesModule } from '../employees/employees.module';
import { NotificationModule } from '../notification/notification.module';
import { TrainingCoursesController } from './training-courses.controller';
import { TrainingCoursesService } from './training-courses.service';
import { TrainingEnrollmentsController } from './training-enrollments.controller';
import { TrainingEnrollmentsService } from './training-enrollments.service';
import { TrainingSessionsController } from './training-sessions.controller';
import { TrainingSessionsService } from './training-sessions.service';

/** P-E — Đào tạo: danh mục khoá + lớp/đợt + đăng ký (+ chứng chỉ ở P-E.3). */
@Module({
  imports: [ApprovalModule, EmployeesModule, NotificationModule],
  controllers: [
    TrainingCoursesController,
    TrainingSessionsController,
    TrainingEnrollmentsController,
  ],
  providers: [
    TrainingCoursesService,
    TrainingSessionsService,
    TrainingEnrollmentsService,
  ],
})
export class TrainingModule {}
