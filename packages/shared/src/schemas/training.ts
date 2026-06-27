import { z } from 'zod';

// =====================================================================
// P-E — Đào tạo / Chứng chỉ
// =====================================================================

// ===== Danh mục khoá đào tạo (TrainingCourse) =====

export const trainingModeSchema = z.enum(['ONLINE', 'OFFLINE', 'EXTERNAL']);
export type TrainingMode = z.infer<typeof trainingModeSchema>;

export const trainingCourseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  category: z.string().nullable(),
  mode: trainingModeSchema,
  provider: z.string().nullable(),
  durationHours: z.number().nullable(),
  /** Chi phí (VND, số nguyên). */
  cost: z.number().int().nullable(),
  description: z.string().nullable(),
  active: z.boolean(),
  sessionCount: z.number().int(),
  createdAt: z.string(),
});
export type TrainingCourseResponse = z.infer<typeof trainingCourseSchema>;

export const createTrainingCourseSchema = z.object({
  title: z.string().trim().min(1).max(300),
  category: z.string().trim().max(100).nullish(),
  mode: trainingModeSchema.default('OFFLINE'),
  provider: z.string().trim().max(200).nullish(),
  durationHours: z.coerce.number().min(0).max(10000).nullish(),
  cost: z.coerce.number().int().min(0).nullish(),
  description: z.string().trim().max(5000).nullish(),
});
export type CreateTrainingCourseInput = z.infer<
  typeof createTrainingCourseSchema
>;

export const updateTrainingCourseSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  category: z.string().trim().max(100).nullish(),
  mode: trainingModeSchema.optional(),
  provider: z.string().trim().max(200).nullish(),
  durationHours: z.coerce.number().min(0).max(10000).nullish(),
  cost: z.coerce.number().int().min(0).nullish(),
  description: z.string().trim().max(5000).nullish(),
  active: z.boolean().optional(),
});
export type UpdateTrainingCourseInput = z.infer<
  typeof updateTrainingCourseSchema
>;

export const listTrainingCoursesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
  category: z.string().trim().max(100).optional(),
  mode: trainingModeSchema.optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().trim().max(255).optional(),
});
export type ListTrainingCoursesQuery = z.infer<
  typeof listTrainingCoursesQuerySchema
>;
