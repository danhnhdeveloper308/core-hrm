import {
  createKpiDefinitionSchema,
  createReviewCycleSchema,
  listKpiDefinitionsQuerySchema,
  listReviewCyclesQuerySchema,
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
