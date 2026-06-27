import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { ManpowerRequestsController } from './manpower-requests.controller';
import { ManpowerRequestsService } from './manpower-requests.service';

/** P-C — Tuyển dụng/ATS. P-C.1: Yêu cầu tuyển dụng (duyệt qua engine). */
@Module({
  imports: [ApprovalModule],
  controllers: [ManpowerRequestsController],
  providers: [ManpowerRequestsService],
})
export class RecruitmentModule {}
