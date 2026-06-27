import {
  createApplicationSchema,
  createCandidateSchema,
  createInterviewSchema,
  createJobRequisitionSchema,
  createManpowerRequestSchema,
  listApplicationsQuerySchema,
  listInterviewsQuerySchema,
  listJobRequisitionsQuerySchema,
  listManpowerRequestsQuerySchema,
  acceptOfferSchema,
  createOfferSchema,
  listOffersQuerySchema,
  submitFeedbackSchema,
  updateApplicationStageSchema,
  updateCandidateSchema,
  updateInterviewSchema,
  updateJobRequisitionSchema,
  updateOfferSchema,
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

export class CreateInterviewDto extends createZodDto(createInterviewSchema) {}

export class UpdateInterviewDto extends createZodDto(updateInterviewSchema) {}

export class ListInterviewsQueryDto extends createZodDto(
  listInterviewsQuerySchema,
) {}

export class SubmitFeedbackDto extends createZodDto(submitFeedbackSchema) {}

export class CreateOfferDto extends createZodDto(createOfferSchema) {}

export class UpdateOfferDto extends createZodDto(updateOfferSchema) {}

export class AcceptOfferDto extends createZodDto(acceptOfferSchema) {}

export class ListOffersQueryDto extends createZodDto(listOffersQuerySchema) {}
