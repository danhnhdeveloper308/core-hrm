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

export const contractTypeSchema = z.enum([
  'PROBATION',
  'FIXED_TERM',
  'INDEFINITE',
  'SEASONAL',
  'SERVICE',
  'APPRENTICESHIP',
]);
export type ContractType = z.infer<typeof contractTypeSchema>;

export const contractStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'EXPIRING',
  'EXPIRED',
  'TERMINATED',
]);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

export const maritalStatusSchema = z.enum([
  'SINGLE',
  'MARRIED',
  'DIVORCED',
  'WIDOWED',
  'OTHER',
]);
export type MaritalStatus = z.infer<typeof maritalStatusSchema>;

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
  // Hồ sơ nhân sự (VN)
  personalEmail: z.string().nullable(),
  idNumber: z.string().nullable(),
  idIssuedDate: z.string().nullable(),
  idIssuedPlace: z.string().nullable(),
  taxCode: z.string().nullable(),
  socialInsuranceNo: z.string().nullable(),
  healthInsuranceNo: z.string().nullable(),
  bankAccountNo: z.string().nullable(),
  bankName: z.string().nullable(),
  bankBranch: z.string().nullable(),
  permanentAddress: z.string().nullable(),
  currentAddress: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  emergencyContactRelation: z.string().nullable(),
  maritalStatus: maritalStatusSchema.nullable(),
  ethnicity: z.string().nullable(),
  nationality: z.string().nullable(),
  religion: z.string().nullable(),
  educationLevel: z.string().nullable(),
  major: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EmployeeResponse = z.infer<typeof employeeSchema>;

/** Các trường hồ sơ nhân sự (VN) — input dùng chung create/update. */
const employeeProfileInput = {
  personalEmail: z.email().nullish(),
  idNumber: z.string().trim().max(20).nullish(),
  idIssuedDate: dateOnlySchema.nullish(),
  idIssuedPlace: z.string().trim().max(200).nullish(),
  taxCode: z.string().trim().max(20).nullish(),
  socialInsuranceNo: z.string().trim().max(20).nullish(),
  healthInsuranceNo: z.string().trim().max(30).nullish(),
  bankAccountNo: z.string().trim().max(30).nullish(),
  bankName: z.string().trim().max(120).nullish(),
  bankBranch: z.string().trim().max(120).nullish(),
  permanentAddress: z.string().trim().max(300).nullish(),
  currentAddress: z.string().trim().max(300).nullish(),
  emergencyContactName: z.string().trim().max(120).nullish(),
  emergencyContactPhone: z.string().trim().max(20).nullish(),
  emergencyContactRelation: z.string().trim().max(60).nullish(),
  maritalStatus: maritalStatusSchema.nullish(),
  ethnicity: z.string().trim().max(60).nullish(),
  nationality: z.string().trim().max(60).nullish(),
  religion: z.string().trim().max(60).nullish(),
  educationLevel: z.string().trim().max(120).nullish(),
  major: z.string().trim().max(120).nullish(),
} as const;

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
  ...employeeProfileInput,
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
  ...employeeProfileInput,
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

/** Phụ cấp: tên khoản → số tiền (VND, integer). */
export const allowancesSchema = z.record(z.string(), z.number().int().min(0));
export type Allowances = z.infer<typeof allowancesSchema>;

export const contractSchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  code: z.string().nullable(),
  type: contractTypeSchema,
  status: contractStatusSchema,
  startDate: z.string(),
  endDate: z.string().nullable(),
  signedDate: z.string().nullable(),
  /** Lương cơ bản (VND, integer) — nguồn cho Payroll. */
  baseSalary: z.number().int().nullable(),
  allowances: allowancesSchema.nullable(),
  /** Phụ lục/gia hạn của hợp đồng cha. */
  parentId: z.uuid().nullable(),
  terminateDate: z.string().nullable(),
  terminateReason: z.string().nullable(),
  hasFile: z.boolean(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type ContractResponse = z.infer<typeof contractSchema>;

export const createContractSchema = z.object({
  type: contractTypeSchema,
  code: z.string().trim().max(60).nullish(),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema.nullish(),
  signedDate: dateOnlySchema.nullish(),
  baseSalary: z.coerce.number().int().min(0).nullish(),
  allowances: allowancesSchema.nullish(),
  status: contractStatusSchema.optional(),
  parentId: z.uuid().nullish(),
  note: z.string().trim().max(1000).nullish(),
});
export type CreateContractInput = z.infer<typeof createContractSchema>;

// ===== Người phụ thuộc (giảm trừ gia cảnh) =====

export const dependentSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  relationship: z.string(),
  dob: z.string().nullable(),
  taxCode: z.string().nullable(),
  note: z.string().nullable(),
});
export type DependentResponse = z.infer<typeof dependentSchema>;

export const createDependentSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  relationship: z.string().trim().min(1).max(60),
  dob: dateOnlySchema.nullish(),
  taxCode: z.string().trim().max(20).nullish(),
  note: z.string().trim().max(500).nullish(),
});
export type CreateDependentInput = z.infer<typeof createDependentSchema>;

export const updateDependentSchema = createDependentSchema.partial();
export type UpdateDependentInput = z.infer<typeof updateDependentSchema>;

/** Chi tiết NV: hồ sơ + hợp đồng + người phụ thuộc. */
export const employeeDetailSchema = employeeSchema.extend({
  contracts: z.array(contractSchema),
  dependents: z.array(dependentSchema),
});
export type EmployeeDetailResponse = z.infer<typeof employeeDetailSchema>;

// ===== Import nhân viên từ Excel =====

export const importEmployeesResultSchema = z.object({
  /** Số dòng dữ liệu đọc được (không tính header). */
  total: z.number().int(),
  /** Số nhân viên tạo thành công. */
  created: z.number().int(),
  /** Các dòng lỗi: số dòng trong file + mã (nếu có) + thông báo. */
  failed: z.array(
    z.object({
      row: z.number().int(),
      code: z.string().nullable(),
      message: z.string(),
    }),
  ),
});
export type ImportEmployeesResult = z.infer<typeof importEmployeesResultSchema>;
