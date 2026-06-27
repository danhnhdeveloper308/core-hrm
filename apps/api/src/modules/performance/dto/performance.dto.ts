import {
  createGoalSchema,
  createKpiDefinitionSchema,
  createReviewCycleSchema,
  listGoalsQuerySchema,
  listKpiDefinitionsQuerySchema,
  listReviewCyclesQuerySchema,
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
