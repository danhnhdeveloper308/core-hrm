import { z } from 'zod';

export const employeeStatusSchema = z.enum([
  'ACTIVE',
  'PROBATION',
  'INACTIVE',
  'TERMINATED',
]);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;

export const genderSchema = z.enum(['MALE', 'FEMALE', 'OTHER']);
export type Gender = z.infer<typeof genderSchema>;

export const contractTypeSchema = z.enum(['PROBATION', 'FIXED_TERM', 'INDEFINITE']);
export type ContractType = z.infer<typeof contractTypeSchema>;

/** "YYYY-MM-DD" — ngày thuần không giờ, tránh lệch timezone. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày YYYY-MM-DD');

const employeeCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, 'Mã nhân viên chỉ gồm chữ, số, gạch dưới, gạch ngang');

export const employeeSchema = z.object({
  id: z.uuid(),
  userId: z.uuid().nullable(),
  userEmail: z.string().nullable(),
  code: z.string(),
  fullName: z.string(),
  dob: z.string().nullable(),
  gender: genderSchema.nullable(),
  phone: z.string().nullable(),
  orgUnitId: z.uuid().nullable(),
  orgUnitName: z.string().nullable(),
  positionId: z.uuid().nullable(),
  positionName: z.string().nullable(),
  managerId: z.uuid().nullable(),
  managerName: z.string().nullable(),
  worksiteId: z.uuid().nullable(),
  worksiteName: z.string().nullable(),
  joinDate: z.string(),
  leaveDate: z.string().nullable(),
  status: employeeStatusSchema,
  avatarUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EmployeeResponse = z.infer<typeof employeeSchema>;

export const createEmployeeSchema = z.object({
  code: employeeCodeSchema,
  fullName: z.string().trim().min(1).max(200),
  dob: dateOnlySchema.nullish(),
  gender: genderSchema.nullish(),
  /** Bắt buộc: dùng làm fallback đổi mật khẩu (mã NV + SĐT) khi không có email. */
  phone: z.string().trim().min(1, 'Số điện thoại là bắt buộc').max(20),
  orgUnitId: z.uuid().nullish(),
  positionId: z.uuid().nullish(),
  managerId: z.uuid().nullish(),
  worksiteId: z.uuid().nullish(),
  joinDate: dateOnlySchema,
  status: employeeStatusSchema.default('ACTIVE'),
  /** Có giá trị = mời tài khoản qua email này (role EMPLOYEE mặc định). */
  inviteEmail: z
    .email()
    .transform((v) => v.toLowerCase())
    .nullish(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  code: employeeCodeSchema.optional(),
  fullName: z.string().trim().min(1).max(200).optional(),
  dob: dateOnlySchema.nullish(),
  gender: genderSchema.nullish(),
  phone: z.string().trim().max(20).nullish(),
  orgUnitId: z.uuid().nullish(),
  positionId: z.uuid().nullish(),
  managerId: z.uuid().nullish(),
  worksiteId: z.uuid().nullish(),
  joinDate: dateOnlySchema.optional(),
  leaveDate: dateOnlySchema.nullish(),
  status: employeeStatusSchema.optional(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const listEmployeesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
  search: z.string().trim().max(255).optional(),
  status: employeeStatusSchema.optional(),
  orgUnitId: z.uuid().optional(),
  positionId: z.uuid().optional(),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

// ===== Contracts =====

export const contractSchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  type: contractTypeSchema,
  startDate: z.string(),
  endDate: z.string().nullable(),
  hasFile: z.boolean(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type ContractResponse = z.infer<typeof contractSchema>;

export const createContractSchema = z.object({
  type: contractTypeSchema,
  startDate: dateOnlySchema,
  endDate: dateOnlySchema.nullish(),
  note: z.string().trim().max(1000).nullish(),
});
export type CreateContractInput = z.infer<typeof createContractSchema>;

// ===== Org chart =====

export interface OrgChartNode {
  id: string;
  fullName: string;
  positionName: string | null;
  orgUnitName: string | null;
  children: OrgChartNode[];
}
