import { z } from 'zod';
import { dateOnlySchema } from './employee';

// =====================================================================
// P-D — Hiệu suất / KPI / 360°
// =====================================================================

// ===== Chu kỳ đánh giá (ReviewCycle) =====

export const reviewCycleTypeSchema = z.enum([
  'QUARTERLY',
  'SEMI',
  'ANNUAL',
  'CUSTOM',
]);
export type ReviewCycleType = z.infer<typeof reviewCycleTypeSchema>;

export const reviewCycleStatusSchema = z.enum([
  'DRAFT',
  'OPEN',
  'CALIBRATING',
  'CLOSED',
]);
export type ReviewCycleStatus = z.infer<typeof reviewCycleStatusSchema>;

export const reviewCycleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: reviewCycleTypeSchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  status: reviewCycleStatusSchema,
  goalCount: z.number().int(),
  reviewCount: z.number().int(),
  createdAt: z.string(),
});
export type ReviewCycleResponse = z.infer<typeof reviewCycleSchema>;

export const createReviewCycleSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    type: reviewCycleTypeSchema.default('QUARTERLY'),
    periodStart: dateOnlySchema,
    periodEnd: dateOnlySchema,
  })
  .refine((d) => d.periodEnd >= d.periodStart, {
    message: 'Ngày kết thúc phải ≥ ngày bắt đầu',
    path: ['periodEnd'],
  });
export type CreateReviewCycleInput = z.infer<typeof createReviewCycleSchema>;

export const updateReviewCycleSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  type: reviewCycleTypeSchema.optional(),
  periodStart: dateOnlySchema.optional(),
  periodEnd: dateOnlySchema.optional(),
  status: reviewCycleStatusSchema.optional(),
});
export type UpdateReviewCycleInput = z.infer<typeof updateReviewCycleSchema>;

export const listReviewCyclesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
  status: reviewCycleStatusSchema.optional(),
});
export type ListReviewCyclesQuery = z.infer<typeof listReviewCyclesQuerySchema>;

// ===== Thư viện KPI (KpiDefinition) =====

export const kpiDirectionSchema = z.enum(['HIGHER_BETTER', 'LOWER_BETTER']);
export type KpiDirection = z.infer<typeof kpiDirectionSchema>;

export const kpiDefinitionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: z.string().nullable(),
  unit: z.string().nullable(),
  direction: kpiDirectionSchema,
  defaultWeight: z.number().int(),
  description: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
});
export type KpiDefinitionResponse = z.infer<typeof kpiDefinitionSchema>;

export const createKpiDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(100).nullish(),
  unit: z.string().trim().max(50).nullish(),
  direction: kpiDirectionSchema.default('HIGHER_BETTER'),
  defaultWeight: z.coerce.number().int().min(0).max(100).default(0),
  description: z.string().trim().max(2000).nullish(),
});
export type CreateKpiDefinitionInput = z.infer<
  typeof createKpiDefinitionSchema
>;

export const updateKpiDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(100).nullish(),
  unit: z.string().trim().max(50).nullish(),
  direction: kpiDirectionSchema.optional(),
  defaultWeight: z.coerce.number().int().min(0).max(100).optional(),
  description: z.string().trim().max(2000).nullish(),
  active: z.boolean().optional(),
});
export type UpdateKpiDefinitionInput = z.infer<
  typeof updateKpiDefinitionSchema
>;

export const listKpiDefinitionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
  category: z.string().trim().max(100).optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().trim().max(255).optional(),
});
export type ListKpiDefinitionsQuery = z.infer<
  typeof listKpiDefinitionsQuerySchema
>;
