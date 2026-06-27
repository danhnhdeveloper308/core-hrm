import {
  createJobRequisitionSchema,
  createManpowerRequestSchema,
  listJobRequisitionsQuerySchema,
  listManpowerRequestsQuerySchema,
  updateJobRequisitionSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateManpowerRequestDto extends createZodDto(
  createManpowerRequestSchema,
) {}

export class ListManpowerRequestsQueryDto extends createZodDto(
  listManpowerRequestsQuerySchema,
) {}

export class CreateJobRequisitionDto extends createZodDto(
  createJobRequisitionSchema,
) {}

export class UpdateJobRequisitionDto extends createZodDto(
  updateJobRequisitionSchema,
) {}

export class ListJobRequisitionsQueryDto extends createZodDto(
  listJobRequisitionsQuerySchema,
) {}
