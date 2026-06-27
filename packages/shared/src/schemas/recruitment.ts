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
