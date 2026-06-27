import { z } from 'zod';
import { contractTypeSchema, dateOnlySchema } from './employee';

// ===== Yêu cầu tuyển dụng (Manpower Request) =====

export const manpowerRequestStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'FULFILLED',
  'CANCELLED',
]);
export type ManpowerRequestStatus = z.infer<typeof manpowerRequestStatusSchema>;

export const manpowerRequestSchema = z.object({
  id: z.uuid(),
  orgUnitId: z.string().nullable(),
  orgUnitName: z.string().nullable(),
  positionId: z.string().nullable(),
  positionName: z.string().nullable(),
  quantity: z.number().int(),
  reason: z.string(),
  neededBy: z.string().nullable(),
  budgetSalary: z.number().int().nullable(),
  status: manpowerRequestStatusSchema,
  requesterId: z.string(),
  requesterName: z.string().nullable(),
  createdAt: z.string(),
});
export type ManpowerRequestResponse = z.infer<typeof manpowerRequestSchema>;

export const createManpowerRequestSchema = z.object({
  orgUnitId: z.uuid().nullish(),
  positionId: z.uuid().nullish(),
  quantity: z.coerce.number().int().min(1).max(1000),
  reason: z.string().trim().min(1).max(1000),
  neededBy: dateOnlySchema.nullish(),
  budgetSalary: z.coerce.number().int().min(0).nullish(),
});
export type CreateManpowerRequestInput = z.infer<
  typeof createManpowerRequestSchema
>;

export const listManpowerRequestsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
  status: manpowerRequestStatusSchema.optional(),
});
export type ListManpowerRequestsQuery = z.infer<
  typeof listManpowerRequestsQuerySchema
>;

// ===== Tin tuyển dụng (Job Requisition) =====

export const requisitionStatusSchema = z.enum([
  'DRAFT',
  'OPEN',
  'ON_HOLD',
  'CLOSED',
  'FILLED',
]);
export type RequisitionStatus = z.infer<typeof requisitionStatusSchema>;

export const jobRequisitionSchema = z.object({
  id: z.uuid(),
  manpowerRequestId: z.string().nullable(),
  title: z.string(),
  orgUnitId: z.string().nullable(),
  orgUnitName: z.string().nullable(),
  positionId: z.string().nullable(),
  positionName: z.string().nullable(),
  headcount: z.number().int(),
  description: z.string().nullable(),
  requirements: z.string().nullable(),
  salaryFrom: z.number().int().nullable(),
  salaryTo: z.number().int().nullable(),
  employmentType: contractTypeSchema.nullable(),
  status: requisitionStatusSchema,
  openedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type JobRequisitionResponse = z.infer<typeof jobRequisitionSchema>;

export const createJobRequisitionSchema = z.object({
  manpowerRequestId: z.uuid().nullish(),
  title: z.string().trim().min(1).max(200),
  orgUnitId: z.uuid().nullish(),
  positionId: z.uuid().nullish(),
  headcount: z.coerce.number().int().min(1).max(1000).default(1),
  description: z.string().trim().max(5000).nullish(),
  requirements: z.string().trim().max(5000).nullish(),
  salaryFrom: z.coerce.number().int().min(0).nullish(),
  salaryTo: z.coerce.number().int().min(0).nullish(),
  employmentType: contractTypeSchema.nullish(),
  status: requisitionStatusSchema.optional(),
});
export type CreateJobRequisitionInput = z.infer<
  typeof createJobRequisitionSchema
>;

export const updateJobRequisitionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  orgUnitId: z.uuid().nullish(),
  positionId: z.uuid().nullish(),
  headcount: z.coerce.number().int().min(1).max(1000).optional(),
  description: z.string().trim().max(5000).nullish(),
  requirements: z.string().trim().max(5000).nullish(),
  salaryFrom: z.coerce.number().int().min(0).nullish(),
  salaryTo: z.coerce.number().int().min(0).nullish(),
  employmentType: contractTypeSchema.nullish(),
  status: requisitionStatusSchema.optional(),
});
export type UpdateJobRequisitionInput = z.infer<
  typeof updateJobRequisitionSchema
>;

export const listJobRequisitionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
  status: requisitionStatusSchema.optional(),
  search: z.string().trim().max(255).optional(),
});
export type ListJobRequisitionsQuery = z.infer<
  typeof listJobRequisitionsQuerySchema
>;

// ===== Ứng viên (Candidate) + Hồ sơ ứng tuyển (Application) =====

export const applicationStageSchema = z.enum([
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
]);
export type ApplicationStage = z.infer<typeof applicationStageSchema>;

export const candidateSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  source: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type CandidateResponse = z.infer<typeof candidateSchema>;

export const createCandidateSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.email().nullish(),
  phone: z.string().trim().max(20).nullish(),
  source: z.string().trim().max(100).nullish(),
  note: z.string().trim().max(2000).nullish(),
});
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

export const updateCandidateSchema = createCandidateSchema.partial();
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;

export const applicationSchema = z.object({
  id: z.uuid(),
  candidateId: z.string(),
  candidateName: z.string(),
  candidateEmail: z.string().nullable(),
  candidatePhone: z.string().nullable(),
  jobRequisitionId: z.string(),
  jobTitle: z.string().nullable(),
  stage: applicationStageSchema,
  ratingAvg: z.number().nullable(),
  rejectReason: z.string().nullable(),
  createdAt: z.string(),
});
export type ApplicationResponse = z.infer<typeof applicationSchema>;

/** Tạo hồ sơ ứng tuyển: chọn ứng viên có sẵn HOẶC tạo mới inline. */
export const createApplicationSchema = z
  .object({
    jobRequisitionId: z.uuid(),
    candidateId: z.uuid().optional(),
    candidate: createCandidateSchema.optional(),
  })
  .refine((d) => Boolean(d.candidateId) || Boolean(d.candidate), {
    message: 'Cần chọn ứng viên có sẵn hoặc nhập ứng viên mới',
  });
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const updateApplicationStageSchema = z.object({
  stage: applicationStageSchema,
  rejectReason: z.string().trim().max(1000).nullish(),
});
export type UpdateApplicationStageInput = z.infer<
  typeof updateApplicationStageSchema
>;

export const listApplicationsQuerySchema = z.object({
  jobRequisitionId: z.uuid().optional(),
  stage: applicationStageSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;

// ===== Phỏng vấn (Interview) =====

export const interviewModeSchema = z.enum(['ONSITE', 'ONLINE', 'PHONE']);
export type InterviewMode = z.infer<typeof interviewModeSchema>;

export const interviewStatusSchema = z.enum([
  'SCHEDULED',
  'DONE',
  'CANCELLED',
  'NO_SHOW',
]);
export type InterviewStatus = z.infer<typeof interviewStatusSchema>;

export const interviewRecommendationSchema = z.enum([
  'HIRE',
  'NO_HIRE',
  'MAYBE',
]);
export type InterviewRecommendation = z.infer<
  typeof interviewRecommendationSchema
>;

export const interviewFeedbackSchema = z.object({
  id: z.uuid(),
  interviewId: z.string(),
  interviewerId: z.string(),
  interviewerName: z.string().nullable(),
  score: z.number().int().nullable(),
  recommendation: interviewRecommendationSchema,
  comment: z.string().nullable(),
  createdAt: z.string(),
});
export type InterviewFeedbackResponse = z.infer<
  typeof interviewFeedbackSchema
>;

export const interviewSchema = z.object({
  id: z.uuid(),
  applicationId: z.string(),
  candidateName: z.string(),
  jobTitle: z.string().nullable(),
  round: z.number().int(),
  mode: interviewModeSchema,
  scheduledAt: z.string(),
  durationMin: z.number().int(),
  location: z.string().nullable(),
  meetingLink: z.string().nullable(),
  status: interviewStatusSchema,
  panelists: z.array(
    z.object({ employeeId: z.string(), employeeName: z.string() }),
  ),
  feedbackCount: z.number().int(),
  createdAt: z.string(),
});
export type InterviewResponse = z.infer<typeof interviewSchema>;

export const createInterviewSchema = z.object({
  applicationId: z.uuid(),
  round: z.coerce.number().int().min(1).max(20).default(1),
  mode: interviewModeSchema.default('ONSITE'),
  scheduledAt: z.string().min(1),
  durationMin: z.coerce.number().int().min(5).max(600).default(60),
  location: z.string().trim().max(300).nullish(),
  meetingLink: z.string().trim().max(500).nullish(),
  panelistEmployeeIds: z.array(z.uuid()).default([]),
});
export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;

export const updateInterviewSchema = z.object({
  round: z.coerce.number().int().min(1).max(20).optional(),
  mode: interviewModeSchema.optional(),
  scheduledAt: z.string().min(1).optional(),
  durationMin: z.coerce.number().int().min(5).max(600).optional(),
  location: z.string().trim().max(300).nullish(),
  meetingLink: z.string().trim().max(500).nullish(),
  status: interviewStatusSchema.optional(),
  panelistEmployeeIds: z.array(z.uuid()).optional(),
});
export type UpdateInterviewInput = z.infer<typeof updateInterviewSchema>;

export const listInterviewsQuerySchema = z.object({
  applicationId: z.uuid().optional(),
  status: interviewStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});
export type ListInterviewsQuery = z.infer<typeof listInterviewsQuerySchema>;

export const submitFeedbackSchema = z.object({
  score: z.coerce.number().int().min(1).max(5).nullish(),
  recommendation: interviewRecommendationSchema,
  comment: z.string().trim().max(2000).nullish(),
});
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
