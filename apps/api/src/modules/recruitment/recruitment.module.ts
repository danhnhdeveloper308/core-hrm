import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
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

/** P-C — Tuyển dụng/ATS: yêu cầu + tin + ứng viên + phỏng vấn. */
@Module({
  imports: [ApprovalModule, NotificationModule],
  controllers: [
    ManpowerRequestsController,
    JobRequisitionsController,
    CandidatesController,
    ApplicationsController,
    InterviewsController,
  ],
  providers: [
    ManpowerRequestsService,
    JobRequisitionsService,
    CandidatesService,
    ApplicationsService,
    InterviewsService,
  ],
})
export class RecruitmentModule {}
