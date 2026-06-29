import { z } from 'zod';
import { dateOnlySchema } from './employee';

// =====================================================================
// P-F — Payroll (lương / thuế / BHXH...) — tiền integer VND
// =====================================================================

// ===== Cấu hình lương/thuế/BH (PayrollConfig) — 1 bản/đơn vị =====

export const pitBracketSchema = z.object({
  upTo: z.coerce.number().int().min(0).nullable(),
  rateBps: z.coerce.number().int().min(0).max(10000),
});
export type PitBracketInput = z.infer<typeof pitBracketSchema>;

export const payrollConfigSchema = z.object({
  personalDeduction: z.number().int(),
  dependentDeduction: z.number().int(),
  baseSalaryGov: z.number().int(),
  regionMinWage: z.number().int(),
  bhxhRateBps: z.number().int(),
  bhytRateBps: z.number().int(),
  bhtnRateBps: z.number().int(),
  pitBrackets: z.array(pitBracketSchema),
  updatedAt: z.string(),
});
export type PayrollConfigResponse = z.infer<typeof payrollConfigSchema>;

export const updatePayrollConfigSchema = z.object({
  personalDeduction: z.coerce.number().int().min(0).optional(),
  dependentDeduction: z.coerce.number().int().min(0).optional(),
  baseSalaryGov: z.coerce.number().int().min(0).optional(),
  regionMinWage: z.coerce.number().int().min(0).optional(),
  bhxhRateBps: z.coerce.number().int().min(0).max(10000).optional(),
  bhytRateBps: z.coerce.number().int().min(0).max(10000).optional(),
  bhtnRateBps: z.coerce.number().int().min(0).max(10000).optional(),
  pitBrackets: z.array(pitBracketSchema).min(1).optional(),
});
export type UpdatePayrollConfigInput = z.infer<
  typeof updatePayrollConfigSchema
>;

// ===== Cấu phần lương (SalaryComponent — catalog) =====

export const salaryComponentKindSchema = z.enum(['EARNING', 'DEDUCTION']);
export type SalaryComponentKind = z.infer<typeof salaryComponentKindSchema>;

export const salaryComponentSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  kind: salaryComponentKindSchema,
  /** Chịu thuế TNCN (chỉ áp dụng EARNING). */
  taxable: z.boolean(),
  /** Có tính vào lương đóng BHXH không. */
  insurance: z.boolean(),
  defaultAmount: z.number().int().nullable(),
  order: z.number().int(),
  active: z.boolean(),
  createdAt: z.string(),
});
export type SalaryComponentResponse = z.infer<typeof salaryComponentSchema>;

export const createSalaryComponentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Z0-9_]+$/, 'Mã chỉ gồm A-Z, 0-9, _'),
  name: z.string().trim().min(1).max(200),
  kind: salaryComponentKindSchema.default('EARNING'),
  taxable: z.boolean().default(true),
  insurance: z.boolean().default(false),
  defaultAmount: z.coerce.number().int().min(0).nullish(),
  order: z.coerce.number().int().min(0).max(1000).default(0),
});
export type CreateSalaryComponentInput = z.infer<
  typeof createSalaryComponentSchema
>;

export const updateSalaryComponentSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  kind: salaryComponentKindSchema.optional(),
  taxable: z.boolean().optional(),
  insurance: z.boolean().optional(),
  defaultAmount: z.coerce.number().int().min(0).nullish(),
  order: z.coerce.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
});
export type UpdateSalaryComponentInput = z.infer<
  typeof updateSalaryComponentSchema
>;

// ===== Lương theo nhân viên (EmployeeSalary — versioned) =====

/** 1 dòng cấu phần trong bản lương của NV (snapshot). */
export const salaryLineSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  kind: salaryComponentKindSchema,
  taxable: z.boolean(),
  insurance: z.boolean(),
  amount: z.coerce.number().int(),
});
export type SalaryLine = z.infer<typeof salaryLineSchema>;

export const employeeSalarySchema = z.object({
  id: z.uuid(),
  employeeId: z.string(),
  employeeName: z.string().nullable(),
  baseSalary: z.number().int(),
  /** Lương đóng BH (mức đăng ký). null = dùng baseSalary. */
  insuranceSalary: z.number().int().nullable(),
  components: z.array(salaryLineSchema),
  effectiveDate: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type EmployeeSalaryResponse = z.infer<typeof employeeSalarySchema>;

export const createEmployeeSalarySchema = z.object({
  employeeId: z.uuid(),
  baseSalary: z.coerce.number().int().min(0),
  insuranceSalary: z.coerce.number().int().min(0).nullish(),
  components: z.array(salaryLineSchema).default([]),
  effectiveDate: dateOnlySchema,
  note: z.string().trim().max(500).nullish(),
});
export type CreateEmployeeSalaryInput = z.infer<
  typeof createEmployeeSalarySchema
>;

export const listEmployeeSalariesQuerySchema = z.object({
  employeeId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});
export type ListEmployeeSalariesQuery = z.infer<
  typeof listEmployeeSalariesQuerySchema
>;

export const listSalaryComponentsQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});
export type ListSalaryComponentsQuery = z.infer<
  typeof listSalaryComponentsQuerySchema
>;

// ===== Phúc lợi (BenefitPlan + EmployeeBenefit) =====

export const benefitPlanSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: z.string().nullable(),
  amount: z.number().int(),
  taxable: z.boolean(),
  active: z.boolean(),
  assignedCount: z.number().int(),
  createdAt: z.string(),
});
export type BenefitPlanResponse = z.infer<typeof benefitPlanSchema>;

export const createBenefitPlanSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(100).nullish(),
  amount: z.coerce.number().int().min(0),
  taxable: z.boolean().default(false),
});
export type CreateBenefitPlanInput = z.infer<typeof createBenefitPlanSchema>;

export const updateBenefitPlanSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(100).nullish(),
  amount: z.coerce.number().int().min(0).optional(),
  taxable: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type UpdateBenefitPlanInput = z.infer<typeof updateBenefitPlanSchema>;

export const listBenefitPlansQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});
export type ListBenefitPlansQuery = z.infer<
  typeof listBenefitPlansQuerySchema
>;

export const employeeBenefitSchema = z.object({
  id: z.uuid(),
  benefitPlanId: z.string(),
  planName: z.string().nullable(),
  category: z.string().nullable(),
  employeeId: z.string(),
  employeeName: z.string().nullable(),
  /** Số tiền hiệu lực (override hoặc theo plan). */
  amount: z.number().int(),
  taxable: z.boolean(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  createdAt: z.string(),
});
export type EmployeeBenefitResponse = z.infer<typeof employeeBenefitSchema>;

export const createEmployeeBenefitSchema = z.object({
  benefitPlanId: z.uuid(),
  employeeId: z.uuid(),
  /** Ghi đè số tiền của plan (null = dùng plan.amount). */
  amount: z.coerce.number().int().min(0).nullish(),
  startDate: dateOnlySchema.nullish(),
  endDate: dateOnlySchema.nullish(),
});
export type CreateEmployeeBenefitInput = z.infer<
  typeof createEmployeeBenefitSchema
>;

export const listEmployeeBenefitsQuerySchema = z.object({
  employeeId: z.uuid().optional(),
  benefitPlanId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.uuid().optional(),
});
export type ListEmployeeBenefitsQuery = z.infer<
  typeof listEmployeeBenefitsQuerySchema
>;
