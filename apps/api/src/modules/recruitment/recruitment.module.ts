import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { JobRequisitionsController } from './job-requisitions.controller';
import { JobRequisitionsService } from './job-requisitions.service';
import { ManpowerRequestsController } from './manpower-requests.controller';
import { ManpowerRequestsService } from './manpower-requests.service';

/** P-C — Tuyển dụng/ATS: yêu cầu nhân sự + tin + ứng viên/hồ sơ ứng tuyển. */
@Module({
  imports: [ApprovalModule],
  controllers: [
    ManpowerRequestsController,
    JobRequisitionsController,
    CandidatesController,
    ApplicationsController,
  ],
  providers: [
    ManpowerRequestsService,
    JobRequisitionsService,
    CandidatesService,
    ApplicationsService,
  ],
})
export class RecruitmentModule {}
