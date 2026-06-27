import {
  createApplicationSchema,
  createCandidateSchema,
  createJobRequisitionSchema,
  createManpowerRequestSchema,
  listApplicationsQuerySchema,
  listJobRequisitionsQuerySchema,
  listManpowerRequestsQuerySchema,
  updateApplicationStageSchema,
  updateCandidateSchema,
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

export class CreateCandidateDto extends createZodDto(createCandidateSchema) {}

export class UpdateCandidateDto extends createZodDto(updateCandidateSchema) {}

export class CreateApplicationDto extends createZodDto(createApplicationSchema) {}

export class UpdateApplicationStageDto extends createZodDto(
  updateApplicationStageSchema,
) {}

export class ListApplicationsQueryDto extends createZodDto(
  listApplicationsQuerySchema,
) {}
