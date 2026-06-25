import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { RbacModule } from '../rbac/rbac.module';
import { ApprovalResolverService } from './approval-resolver.service';
import { ApprovalFlowService } from './approval-flow.service';
import { ApprovalSlaService } from './approval-sla.service';
import {
  ApprovalController,
  ApprovalFlowController,
} from './approval.controller';
import { ApprovalService } from './approval.service';

@Module({
  imports: [RbacModule, NotificationModule],
  controllers: [ApprovalFlowController, ApprovalController],
  providers: [
    ApprovalResolverService,
    ApprovalFlowService,
    ApprovalService,
    ApprovalSlaService,
  ],
  exports: [ApprovalService],
})
export class ApprovalModule {}
