import {
  createApprovalFlowSchema,
  decideApprovalSchema,
  updateApprovalFlowSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateApprovalFlowDto extends createZodDto(createApprovalFlowSchema) {}
export class UpdateApprovalFlowDto extends createZodDto(updateApprovalFlowSchema) {}
export class DecideApprovalDto extends createZodDto(decideApprovalSchema) {}
