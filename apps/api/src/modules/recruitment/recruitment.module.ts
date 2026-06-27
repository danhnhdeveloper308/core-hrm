import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { EmployeesModule } from '../employees/employees.module';
import { NotificationModule } from '../notification/notification.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
import { JobRequisitionsController } from './job-requisitions.controller';
import { JobRequisitionsService } from './job-requisitions.service';
import { ManpowerRequestsController } from './manpower-requests.controller';
import { ManpowerRequestsService } from './manpower-requests.service';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

/** P-C — Tuyển dụng/ATS: yêu cầu + tin + ứng viên + phỏng vấn + offer. */
@Module({
  imports: [ApprovalModule, NotificationModule, EmployeesModule],
  controllers: [
    ManpowerRequestsController,
    JobRequisitionsController,
    CandidatesController,
    ApplicationsController,
    InterviewsController,
    OffersController,
  ],
  providers: [
    ManpowerRequestsService,
    JobRequisitionsService,
    CandidatesService,
    ApplicationsService,
    InterviewsService,
    OffersService,
  ],
})
export class RecruitmentModule {}
