import {
  createFeedback360Schema,
  createGoalSchema,
  createKpiDefinitionSchema,
  createPerformanceReviewSchema,
  createReviewCycleSchema,
  generateReviewsSchema,
  listFeedback360QuerySchema,
  listGoalsQuerySchema,
  listKpiDefinitionsQuerySchema,
  listPerformanceReviewsQuerySchema,
  listReviewCyclesQuerySchema,
  submitFeedback360Schema,
  submitManagerReviewSchema,
  submitSelfReviewSchema,
  updateGoalProgressSchema,
  updateGoalSchema,
  updateKpiDefinitionSchema,
  updateReviewCycleSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateReviewCycleDto extends createZodDto(
  createReviewCycleSchema,
) {}

export class UpdateReviewCycleDto extends createZodDto(
  updateReviewCycleSchema,
) {}

export class ListReviewCyclesQueryDto extends createZodDto(
  listReviewCyclesQuerySchema,
) {}

export class CreateKpiDefinitionDto extends createZodDto(
  createKpiDefinitionSchema,
) {}

export class UpdateKpiDefinitionDto extends createZodDto(
  updateKpiDefinitionSchema,
) {}

export class ListKpiDefinitionsQueryDto extends createZodDto(
  listKpiDefinitionsQuerySchema,
) {}

export class CreateGoalDto extends createZodDto(createGoalSchema) {}

export class UpdateGoalDto extends createZodDto(updateGoalSchema) {}

export class UpdateGoalProgressDto extends createZodDto(
  updateGoalProgressSchema,
) {}

export class ListGoalsQueryDto extends createZodDto(listGoalsQuerySchema) {}

export class CreatePerformanceReviewDto extends createZodDto(
  createPerformanceReviewSchema,
) {}

export class GenerateReviewsDto extends createZodDto(generateReviewsSchema) {}

export class SubmitSelfReviewDto extends createZodDto(submitSelfReviewSchema) {}

export class SubmitManagerReviewDto extends createZodDto(
  submitManagerReviewSchema,
) {}

export class ListPerformanceReviewsQueryDto extends createZodDto(
  listPerformanceReviewsQuerySchema,
) {}

export class CreateFeedback360Dto extends createZodDto(
  createFeedback360Schema,
) {}

export class SubmitFeedback360Dto extends createZodDto(
  submitFeedback360Schema,
) {}

export class ListFeedback360QueryDto extends createZodDto(
  listFeedback360QuerySchema,
) {}
