import { z } from 'zod';

/** Trần OT mặc định theo luật lao động VN (giờ): 40h/tháng, 200h/năm. */
export const VN_OT_DEFAULTS = {
  maxHoursPerMonth: 40,
  maxHoursPerYear: 200,
} as const;

// ===== Chính sách trần OT =====

export const otPolicySchema = z.object({
  id: z.uuid(),
  /** null = trần mặc định toàn tổ chức; có giá trị = override cho đơn vị (subtree). */
  orgUnitId: z.uuid().nullable(),
  orgUnitName: z.string().nullable(),
  maxHoursPerMonth: z.number().int().positive(),
  maxHoursPerYear: z.number().int().positive(),
});
export type OtPolicyResponse = z.infer<typeof otPolicySchema>;

export const createOtPolicySchema = z.object({
  /** Bỏ trống = trần mặc định toàn org (mỗi org/đơn vị chỉ 1 trần). */
  orgUnitId: z.uuid().nullish(),
  maxHoursPerMonth: z.coerce.number().int().min(1).max(2000),
  maxHoursPerYear: z.coerce.number().int().min(1).max(20000),
});
export type CreateOtPolicyInput = z.infer<typeof createOtPolicySchema>;

export const updateOtPolicySchema = z.object({
  maxHoursPerMonth: z.coerce.number().int().min(1).max(2000).optional(),
  maxHoursPerYear: z.coerce.number().int().min(1).max(20000).optional(),
});
export type UpdateOtPolicyInput = z.infer<typeof updateOtPolicySchema>;

// ===== Tổng hợp OT theo tháng =====

export const overtimeSummaryQuerySchema = z.object({
  /** Tháng YYYY-MM. */
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Tháng dạng YYYY-MM'),
  /** Lọc theo đơn vị (gồm đơn vị con). */
  orgUnitId: z.uuid().optional(),
});
export type OvertimeSummaryQuery = z.infer<typeof overtimeSummaryQuerySchema>;

export const overtimeSummaryRowSchema = z.object({
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeName: z.string(),
  orgUnitId: z.string().nullable(),
  orgUnitName: z.string().nullable(),
  /** Giờ OT trong tháng đã chọn. */
  monthHours: z.number(),
  /** Giờ OT luỹ kế từ đầu năm tới hết tháng đã chọn. */
  yearHours: z.number(),
  maxHoursPerMonth: z.number().int(),
  maxHoursPerYear: z.number().int(),
  overMonth: z.boolean(),
  overYear: z.boolean(),
});
export type OvertimeSummaryRow = z.infer<typeof overtimeSummaryRowSchema>;

export const overtimeSummarySchema = z.object({
  month: z.string(),
  /** Trần mặc định toàn org (để hiển thị header). */
  caps: z.object({
    maxHoursPerMonth: z.number().int(),
    maxHoursPerYear: z.number().int(),
  }),
  rows: z.array(overtimeSummaryRowSchema),
  byUnit: z.array(
    z.object({
      orgUnitId: z.string().nullable(),
      orgUnitName: z.string(),
      monthHours: z.number(),
      employees: z.number().int(),
      overCount: z.number().int(),
    }),
  ),
  totals: z.object({
    monthHours: z.number(),
    employees: z.number().int(),
    overMonth: z.number().int(),
    overYear: z.number().int(),
  }),
});
export type OvertimeSummary = z.infer<typeof overtimeSummarySchema>;
