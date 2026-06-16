import {
  adjustBalanceSchema,
  createLeavePolicySchema,
  createLeaveRequestSchema,
  createLeaveTypeSchema,
  listLeaveRequestsQuerySchema,
  updateLeavePolicySchema,
  updateLeaveTypeSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateLeaveTypeDto extends createZodDto(createLeaveTypeSchema) {}
export class UpdateLeaveTypeDto extends createZodDto(updateLeaveTypeSchema) {}
export class CreateLeavePolicyDto extends createZodDto(createLeavePolicySchema) {}
export class UpdateLeavePolicyDto extends createZodDto(updateLeavePolicySchema) {}
export class CreateLeaveRequestDto extends createZodDto(createLeaveRequestSchema) {}
export class ListLeaveRequestsQueryDto extends createZodDto(
  listLeaveRequestsQuerySchema,
) {}
export class AdjustBalanceDto extends createZodDto(adjustBalanceSchema) {}
