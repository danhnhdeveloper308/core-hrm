import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { EmployeesModule } from '../employees/employees.module';
import { NotificationModule } from '../notification/notification.module';
import { CertificationReminderService } from './certification-reminder.service';
import { CertificationsController } from './certifications.controller';
import { CertificationsService } from './certifications.service';
import { TrainingCoursesController } from './training-courses.controller';
import { TrainingCoursesService } from './training-courses.service';
import { TrainingEnrollmentsController } from './training-enrollments.controller';
import { TrainingEnrollmentsService } from './training-enrollments.service';
import { TrainingSessionsController } from './training-sessions.controller';
import { TrainingSessionsService } from './training-sessions.service';

/** P-E — Đào tạo: danh mục khoá + lớp/đợt + đăng ký + chứng chỉ (+ cron nhắc hạn). */
@Module({
  imports: [ApprovalModule, EmployeesModule, NotificationModule],
  controllers: [
    TrainingCoursesController,
    TrainingSessionsController,
    TrainingEnrollmentsController,
    CertificationsController,
  ],
  providers: [
    TrainingCoursesService,
    TrainingSessionsService,
    TrainingEnrollmentsService,
    CertificationsService,
    CertificationReminderService,
  ],
})
export class TrainingModule {}
