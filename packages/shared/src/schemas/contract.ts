import { z } from 'zod';
import {
  allowancesSchema,
  contractSchema,
  contractStatusSchema,
  contractTypeSchema,
  createContractSchema,
  dateOnlySchema,
} from './employee';

// ===== Quản lý hợp đồng cấp tổ chức (P-B) =====

export const listContractsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  status: contractStatusSchema.optional(),
  type: contractTypeSchema.optional(),
  /** Lọc HĐ sắp hết hạn trong N ngày tới (chỉ HĐ có endDate, chưa kết thúc). */
  expiringInDays: z.coerce.number().int().min(1).max(365).optional(),
  search: z.string().trim().max(255).optional(),
});
export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;

/** 1 dòng trong danh sách HĐ org — kèm thông tin nhân viên. */
export const contractListItemSchema = contractSchema.extend({
  employeeName: z.string(),
  employeeCode: z.string(),
  orgUnitName: z.string().nullable(),
});
export type ContractListItem = z.infer<typeof contractListItemSchema>;

export const createOrgContractSchema = createContractSchema.extend({
  employeeId: z.uuid(),
});
export type CreateOrgContractInput = z.infer<typeof createOrgContractSchema>;

export const updateContractSchema = z.object({
  type: contractTypeSchema.optional(),
  code: z.string().trim().max(60).nullish(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.nullish(),
  signedDate: dateOnlySchema.nullish(),
  baseSalary: z.coerce.number().int().min(0).nullish(),
  allowances: allowancesSchema.nullish(),
  status: contractStatusSchema.optional(),
  note: z.string().trim().max(1000).nullish(),
});
export type UpdateContractInput = z.infer<typeof updateContractSchema>;

export const terminateContractSchema = z.object({
  terminateDate: dateOnlySchema,
  reason: z.string().trim().min(1).max(1000),
});
export type TerminateContractInput = z.infer<typeof terminateContractSchema>;
