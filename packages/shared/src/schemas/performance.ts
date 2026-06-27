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

// ===== Mục tiêu (Goal — OKR/MBO) =====

export const goalStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'DONE',
  'CANCELLED',
]);
export type GoalStatus = z.infer<typeof goalStatusSchema>;

export const goalSchema = z.object({
  id: z.uuid(),
  employeeId: z.string(),
  employeeName: z.string().nullable(),
  cycleId: z.string(),
  cycleName: z.string().nullable(),
  parentId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  kpiDefinitionId: z.string().nullable(),
  kpiName: z.string().nullable(),
  target: z.number().nullable(),
  actual: z.number().nullable(),
  unit: z.string().nullable(),
  weight: z.number().int(),
  progress: z.number().int(),
  status: goalStatusSchema,
  createdAt: z.string(),
});
export type GoalResponse = z.infer<typeof goalSchema>;

export const createGoalSchema = z.object({
  /** Bỏ trống = mục tiêu của chính mình. */
  employeeId: z.uuid().nullish(),
  cycleId: z.uuid(),
  parentId: z.uuid().nullish(),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).nullish(),
  kpiDefinitionId: z.uuid().nullish(),
  target: z.coerce.number().nullish(),
  unit: z.string().trim().max(50).nullish(),
  weight: z.coerce.number().int().min(0).max(100).default(0),
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(2000).nullish(),
  kpiDefinitionId: z.uuid().nullish(),
  parentId: z.uuid().nullish(),
  target: z.coerce.number().nullish(),
  unit: z.string().trim().max(50).nullish(),
  weight: z.coerce.number().int().min(0).max(100).optional(),
  status: goalStatusSchema.optional(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const updateGoalProgressSchema = z.object({
  actual: z.coerce.number().nullish(),
  progress: z.coerce.number().int().min(0).max(100),
});
export type UpdateGoalProgressInput = z.infer<
  typeof updateGoalProgressSchema
>;

export const listGoalsQuerySchema = z.object({
  cycleId: z.uuid().optional(),
  /** Bỏ trống = mục tiêu trong phạm vi của tôi (bản thân + cấp dưới). */
  employeeId: z.uuid().optional(),
  status: goalStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});
export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;
