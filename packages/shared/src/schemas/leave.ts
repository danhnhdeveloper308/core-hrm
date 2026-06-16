import { z } from 'zod';
import { dateOnlySchema } from './employee';

export const leaveAccrualTypeSchema = z.enum(['YEARLY_UPFRONT', 'MONTHLY']);
export type LeaveAccrualType = z.infer<typeof leaveAccrualTypeSchema>;

export const leaveHalfSchema = z.enum(['FULL', 'AM', 'PM']);
export type LeaveHalf = z.infer<typeof leaveHalfSchema>;

export const leaveRequestStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type LeaveRequestStatus = z.infer<typeof leaveRequestStatusSchema>;

export const leaveEntryTypeSchema = z.enum([
  'ACCRUAL',
  'USAGE',
  'REVERT',
  'CARRY_OVER',
  'EXPIRY',
  'ADJUSTMENT',
]);
export type LeaveEntryType = z.infer<typeof leaveEntryTypeSchema>;

const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Z0-9_]+$/, 'Code chỉ gồm chữ in hoa, số, gạch dưới');

// ===== LeaveType =====

export const leaveTypeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  paid: z.boolean(),
  color: z.string(),
  requiresDocument: z.boolean(),
});
export type LeaveTypeResponse = z.infer<typeof leaveTypeSchema>;

export const createLeaveTypeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: codeSchema,
  paid: z.boolean().default(true),
  color: z.string().trim().default('#3b82f6'),
  /** Loại phép cần giấy tờ (bệnh/thai sản) → form đăng ký hiện ô đính kèm. */
  requiresDocument: z.boolean().default(false),
});
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;

export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;

// ===== LeavePolicy =====

export const leavePolicySchema = z.object({
  id: z.uuid(),
  leaveTypeId: z.uuid(),
  leaveTypeName: z.string(),
  orgUnitId: z.uuid().nullable(),
  daysPerYear: z.number(),
  accrualType: leaveAccrualTypeSchema,
  prorateFirstYear: z.boolean(),
  seniorityBonusDays: z.number().int(),
  seniorityEveryYears: z.number().int(),
  carryOverMaxDays: z.number(),
  carryOverExpiresOn: z.string().nullable(),
  allowNegativeBalance: z.boolean(),
});
export type LeavePolicyResponse = z.infer<typeof leavePolicySchema>;

export const createLeavePolicySchema = z.object({
  leaveTypeId: z.uuid(),
  /** Null = mặc định toàn org; có giá trị = override cho subtree đơn vị. */
  orgUnitId: z.uuid().nullish(),
  daysPerYear: z.number().min(0).max(365),
  accrualType: leaveAccrualTypeSchema.default('YEARLY_UPFRONT'),
  prorateFirstYear: z.boolean().default(true),
  seniorityBonusDays: z.number().int().min(0).max(30).default(0),
  seniorityEveryYears: z.number().int().min(1).max(50).default(5),
  carryOverMaxDays: z.number().min(0).max(365).default(0),
  /** "MM-DD" — hạn dùng hết phép chuyển kỳ. */
  carryOverExpiresOn: z
    .string()
    .regex(/^\d{2}-\d{2}$/, 'Định dạng MM-DD')
    .nullish(),
  allowNegativeBalance: z.boolean().default(false),
});
export type CreateLeavePolicyInput = z.infer<typeof createLeavePolicySchema>;

export const updateLeavePolicySchema = createLeavePolicySchema.partial().omit({
  leaveTypeId: true,
});
export type UpdateLeavePolicyInput = z.infer<typeof updateLeavePolicySchema>;

// ===== Balance =====

export const leaveBalanceSchema = z.object({
  leaveTypeId: z.uuid(),
  leaveTypeName: z.string(),
  leaveTypeColor: z.string(),
  paid: z.boolean(),
  year: z.number().int(),
  /** Tổng cộng dồn (accrual + carry-over + revert + adjustment). */
  accrued: z.number(),
  /** Đã dùng (đơn APPROVED). */
  used: z.number(),
  /** Đang chờ duyệt (chưa trừ ledger nhưng giữ chỗ). */
  pending: z.number(),
  /** Còn lại khả dụng = accrued - used - pending. */
  available: z.number(),
  /** Phép chuyển kỳ sắp hết hạn (nếu có). */
  carryOverExpiring: z.number(),
});
export type LeaveBalanceResponse = z.infer<typeof leaveBalanceSchema>;

export const leaveLedgerEntrySchema = z.object({
  id: z.uuid(),
  leaveTypeId: z.uuid(),
  year: z.number().int(),
  amount: z.number(),
  type: leaveEntryTypeSchema,
  reason: z.string(),
  createdAt: z.string(),
});
export type LeaveLedgerEntryResponse = z.infer<typeof leaveLedgerEntrySchema>;

export const adjustBalanceSchema = z.object({
  employeeId: z.uuid(),
  leaveTypeId: z.uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  /** Số ngày điều chỉnh (+/-). */
  amount: z.number(),
  reason: z.string().trim().min(1).max(500),
});
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;

// ===== LeaveRequest =====

export const leaveRequestSchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  employeeName: z.string(),
  leaveTypeId: z.uuid(),
  leaveTypeName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  startHalf: leaveHalfSchema,
  endHalf: leaveHalfSchema,
  totalDays: z.number(),
  reason: z.string(),
  status: leaveRequestStatusSchema,
  approvalInstanceId: z.uuid().nullable(),
  createdAt: z.string(),
});
export type LeaveRequestResponse = z.infer<typeof leaveRequestSchema>;

export const createLeaveRequestSchema = z
  .object({
    leaveTypeId: z.uuid(),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    startHalf: leaveHalfSchema.default('FULL'),
    endHalf: leaveHalfSchema.default('FULL'),
    reason: z.string().trim().min(1).max(500),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
    path: ['endDate'],
  });
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;

export const listLeaveRequestsQuerySchema = z.object({
  status: leaveRequestStatusSchema.optional(),
  employeeId: z.uuid().optional(),
  /** mine = đơn của tôi; team = đơn trong phạm vi quản lý (scope subtree). */
  scope: z.enum(['mine', 'team', 'all']).default('mine'),
});
export type ListLeaveRequestsQuery = z.infer<typeof listLeaveRequestsQuerySchema>;
