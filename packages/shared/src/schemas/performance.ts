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

// ===== Đánh giá hiệu suất (PerformanceReview) =====

export const performanceReviewStatusSchema = z.enum([
  'SELF',
  'MANAGER',
  'CALIBRATION',
  'DONE',
]);
export type PerformanceReviewStatus = z.infer<
  typeof performanceReviewStatusSchema
>;

export const performanceReviewSchema = z.object({
  id: z.uuid(),
  employeeId: z.string(),
  employeeName: z.string().nullable(),
  cycleId: z.string(),
  cycleName: z.string().nullable(),
  reviewerId: z.string().nullable(),
  reviewerName: z.string().nullable(),
  selfScore: z.number().nullable(),
  selfComment: z.string().nullable(),
  managerScore: z.number().nullable(),
  managerComment: z.string().nullable(),
  finalScore: z.number().nullable(),
  ratingLabel: z.string().nullable(),
  status: performanceReviewStatusSchema,
  submittedSelfAt: z.string().nullable(),
  submittedManagerAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PerformanceReviewResponse = z.infer<
  typeof performanceReviewSchema
>;

export const createPerformanceReviewSchema = z.object({
  employeeId: z.uuid(),
  cycleId: z.uuid(),
  reviewerId: z.uuid().nullish(),
});
export type CreatePerformanceReviewInput = z.infer<
  typeof createPerformanceReviewSchema
>;

/** Sinh hàng loạt phiếu đánh giá cho 1 chu kỳ (mỗi NV trong phạm vi 1 phiếu). */
export const generateReviewsSchema = z.object({
  cycleId: z.uuid(),
});
export type GenerateReviewsInput = z.infer<typeof generateReviewsSchema>;

const scoreSchema = z.coerce.number().min(0).max(5);

export const submitSelfReviewSchema = z.object({
  selfScore: scoreSchema,
  selfComment: z.string().trim().max(4000).nullish(),
});
export type SubmitSelfReviewInput = z.infer<typeof submitSelfReviewSchema>;

export const submitManagerReviewSchema = z.object({
  managerScore: scoreSchema,
  managerComment: z.string().trim().max(4000).nullish(),
  finalScore: scoreSchema,
  ratingLabel: z.string().trim().max(100).nullish(),
});
export type SubmitManagerReviewInput = z.infer<
  typeof submitManagerReviewSchema
>;

export const listPerformanceReviewsQuerySchema = z.object({
  cycleId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  status: performanceReviewStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});
export type ListPerformanceReviewsQuery = z.infer<
  typeof listPerformanceReviewsQuerySchema
>;

// ===== Phản hồi 360° (Feedback360) =====

export const feedback360StatusSchema = z.enum(['COLLECTING', 'CLOSED']);
export type Feedback360Status = z.infer<typeof feedback360StatusSchema>;

export const rater360RelationSchema = z.enum([
  'MANAGER',
  'PEER',
  'SUBORDINATE',
  'SELF',
]);
export type Rater360Relation = z.infer<typeof rater360RelationSchema>;

/** Tóm tắt 1 đợt 360° (danh sách). */
export const feedback360Schema = z.object({
  id: z.uuid(),
  revieweeId: z.string(),
  revieweeName: z.string().nullable(),
  cycleId: z.string(),
  cycleName: z.string().nullable(),
  status: feedback360StatusSchema,
  anonymous: z.boolean(),
  raterCount: z.number().int(),
  submittedCount: z.number().int(),
  avgScore: z.number().nullable(),
  createdAt: z.string(),
});
export type Feedback360Response = z.infer<typeof feedback360Schema>;

/** Tổng hợp theo nhóm quan hệ — KHÔNG lộ danh tính khi ẩn danh. */
export const feedback360RelationStatSchema = z.object({
  relation: rater360RelationSchema,
  count: z.number().int(),
  submitted: z.number().int(),
  avgScore: z.number().nullable(),
});
export type Feedback360RelationStat = z.infer<
  typeof feedback360RelationStatSchema
>;

export const feedback360CommentSchema = z.object({
  relation: rater360RelationSchema,
  comment: z.string(),
  /** Chỉ có khi đợt KHÔNG ẩn danh. */
  raterName: z.string().nullable(),
});
export type Feedback360Comment = z.infer<typeof feedback360CommentSchema>;

/** Chi tiết 1 đợt 360° (đã tổng hợp / ẩn danh nếu cần). */
export const feedback360DetailSchema = feedback360Schema.extend({
  byRelation: z.array(feedback360RelationStatSchema),
  comments: z.array(feedback360CommentSchema),
});
export type Feedback360Detail = z.infer<typeof feedback360DetailSchema>;

export const createFeedback360RaterSchema = z.object({
  employeeId: z.uuid(),
  relation: rater360RelationSchema,
});
export type CreateFeedback360RaterInput = z.infer<
  typeof createFeedback360RaterSchema
>;

export const createFeedback360Schema = z.object({
  revieweeId: z.uuid(),
  cycleId: z.uuid(),
  anonymous: z.boolean().default(true),
  raters: z.array(createFeedback360RaterSchema).min(1, 'Cần ít nhất 1 người đánh giá'),
});
export type CreateFeedback360Input = z.infer<typeof createFeedback360Schema>;

export const submitFeedback360Schema = z.object({
  score: z.coerce.number().min(0).max(5),
  comment: z.string().trim().max(4000).nullish(),
});
export type SubmitFeedback360Input = z.infer<typeof submitFeedback360Schema>;

export const listFeedback360QuerySchema = z.object({
  cycleId: z.uuid().optional(),
  revieweeId: z.uuid().optional(),
  status: feedback360StatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});
export type ListFeedback360Query = z.infer<typeof listFeedback360QuerySchema>;

/** 1 lời mời đánh giá 360° của tôi (để điền). */
export const feedback360InvitationSchema = z.object({
  raterId: z.uuid(),
  feedback360Id: z.string(),
  revieweeName: z.string().nullable(),
  cycleName: z.string().nullable(),
  relation: rater360RelationSchema,
  status: feedback360StatusSchema,
  submitted: z.boolean(),
  score: z.number().nullable(),
  comment: z.string().nullable(),
});
export type Feedback360Invitation = z.infer<
  typeof feedback360InvitationSchema
>;
