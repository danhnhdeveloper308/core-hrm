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

// ===== Lớp / đợt đào tạo (TrainingSession) =====

export const trainingSessionStatusSchema = z.enum([
  'OPEN',
  'FULL',
  'RUNNING',
  'DONE',
  'CANCELLED',
]);
export type TrainingSessionStatus = z.infer<
  typeof trainingSessionStatusSchema
>;

export const trainingSessionSchema = z.object({
  id: z.uuid(),
  courseId: z.string(),
  courseTitle: z.string().nullable(),
  title: z.string().nullable(),
  startAt: z.string(),
  endAt: z.string().nullable(),
  location: z.string().nullable(),
  link: z.string().nullable(),
  trainerEmployeeId: z.string().nullable(),
  trainerName: z.string().nullable(),
  capacity: z.number().int().nullable(),
  status: trainingSessionStatusSchema,
  enrolledCount: z.number().int(),
  createdAt: z.string(),
});
export type TrainingSessionResponse = z.infer<typeof trainingSessionSchema>;

export const createTrainingSessionSchema = z.object({
  courseId: z.uuid(),
  title: z.string().trim().max(300).nullish(),
  startAt: z.string().min(1),
  endAt: z.string().min(1).nullish(),
  location: z.string().trim().max(300).nullish(),
  link: z.string().trim().max(500).nullish(),
  trainerEmployeeId: z.uuid().nullish(),
  capacity: z.coerce.number().int().min(1).max(100000).nullish(),
});
export type CreateTrainingSessionInput = z.infer<
  typeof createTrainingSessionSchema
>;

export const updateTrainingSessionSchema = z.object({
  title: z.string().trim().max(300).nullish(),
  startAt: z.string().min(1).optional(),
  endAt: z.string().min(1).nullish(),
  location: z.string().trim().max(300).nullish(),
  link: z.string().trim().max(500).nullish(),
  trainerEmployeeId: z.uuid().nullish(),
  capacity: z.coerce.number().int().min(1).max(100000).nullish(),
  status: trainingSessionStatusSchema.optional(),
});
export type UpdateTrainingSessionInput = z.infer<
  typeof updateTrainingSessionSchema
>;

export const listTrainingSessionsQuerySchema = z.object({
  courseId: z.uuid().optional(),
  status: trainingSessionStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});
export type ListTrainingSessionsQuery = z.infer<
  typeof listTrainingSessionsQuerySchema
>;

// ===== Đăng ký học (TrainingEnrollment) =====

export const trainingEnrollmentStatusSchema = z.enum([
  'REGISTERED',
  'CONFIRMED',
  'ATTENDED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);
export type TrainingEnrollmentStatus = z.infer<
  typeof trainingEnrollmentStatusSchema
>;

export const trainingEnrollmentSchema = z.object({
  id: z.uuid(),
  sessionId: z.string(),
  sessionTitle: z.string().nullable(),
  courseTitle: z.string().nullable(),
  startAt: z.string().nullable(),
  employeeId: z.string(),
  employeeName: z.string().nullable(),
  status: trainingEnrollmentStatusSchema,
  score: z.number().nullable(),
  feedback: z.string().nullable(),
  createdAt: z.string(),
});
export type TrainingEnrollmentResponse = z.infer<
  typeof trainingEnrollmentSchema
>;

/** HR ghi danh hộ 1 NV. NV tự đăng ký dùng POST /training/sessions/:id/register. */
export const createTrainingEnrollmentSchema = z.object({
  sessionId: z.uuid(),
  employeeId: z.uuid(),
});
export type CreateTrainingEnrollmentInput = z.infer<
  typeof createTrainingEnrollmentSchema
>;

/** HR cập nhật trạng thái / điểm / nhận xét (điểm danh, hoàn thành...). */
export const updateTrainingEnrollmentSchema = z.object({
  status: trainingEnrollmentStatusSchema.optional(),
  score: z.coerce.number().min(0).max(100).nullish(),
  feedback: z.string().trim().max(2000).nullish(),
});
export type UpdateTrainingEnrollmentInput = z.infer<
  typeof updateTrainingEnrollmentSchema
>;

export const listTrainingEnrollmentsQuerySchema = z.object({
  sessionId: z.uuid().optional(),
  /** Bỏ trống = đăng ký trong phạm vi của tôi (bản thân + cấp dưới). */
  employeeId: z.uuid().optional(),
  status: trainingEnrollmentStatusSchema.optional(),
  /** mine=true → chỉ đăng ký của chính tôi. */
  mine: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});
export type ListTrainingEnrollmentsQuery = z.infer<
  typeof listTrainingEnrollmentsQuerySchema
>;
