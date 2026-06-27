import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { JobRequisitionsController } from './job-requisitions.controller';
import { JobRequisitionsService } from './job-requisitions.service';
import { ManpowerRequestsController } from './manpower-requests.controller';
import { ManpowerRequestsService } from './manpower-requests.service';

/** P-C — Tuyển dụng/ATS: yêu cầu nhân sự (duyệt) + tin tuyển dụng. */
@Module({
  imports: [ApprovalModule],
  controllers: [ManpowerRequestsController, JobRequisitionsController],
  providers: [ManpowerRequestsService, JobRequisitionsService],
})
export class RecruitmentModule {}
