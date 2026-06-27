import { z } from 'zod';
import { dateOnlySchema } from './employee';

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
