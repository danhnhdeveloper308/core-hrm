import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ApprovalResolverService } from './approval-resolver.service';
import { ApprovalFlowService } from './approval-flow.service';
import {
  ApprovalController,
  ApprovalFlowController,
} from './approval.controller';
import { ApprovalService } from './approval.service';

@Module({
  imports: [RbacModule],
  controllers: [ApprovalFlowController, ApprovalController],
  providers: [ApprovalResolverService, ApprovalFlowService, ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
