import { z } from 'zod';
import { ALL_ORG_STRUCTURE_PRESETS } from '../constants/org-presets';
import { paginationQuerySchema } from './common';

// ============================================================
// Organization (platform admin)
// ============================================================

export const orgStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);
export type OrgStatus = z.infer<typeof orgStatusSchema>;

export const organizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: orgStatusSchema,
  timezone: z.string(),
  /** Cách tính công mặc định khi áp phiếu tăng/giãn ca. */
  otCalcMode: z.enum(['CLAMP_TO_REGISTERED', 'SEPARATE_OT']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrganizationResponse = z.infer<typeof organizationSchema>;

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang');

export const listOrganizationsQuerySchema = paginationQuerySchema.extend({
  status: orgStatusSchema.optional(),
});
export type ListOrganizationsQuery = z.infer<typeof listOrganizationsQuerySchema>;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: slugSchema,
  timezone: z.string().trim().min(1).default('Asia/Ho_Chi_Minh'),
  preset: z.enum(ALL_ORG_STRUCTURE_PRESETS),
  /** Email org admin đầu tiên — được mời qua invite flow. */
  adminEmail: z.email().transform((v) => v.toLowerCase()),
  adminName: z.string().trim().min(1).max(200),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  timezone: z.string().trim().min(1).optional(),
  status: orgStatusSchema.optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

// ============================================================
// OrgUnitType
// ============================================================

const unitTypeCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Z0-9_]+$/, 'Code chỉ gồm chữ in hoa, số và gạch dưới');

export const orgUnitTypeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  rank: z.number().int(),
});
export type OrgUnitTypeResponse = z.infer<typeof orgUnitTypeSchema>;

export const createOrgUnitTypeSchema = z.object({
  code: unitTypeCodeSchema,
  name: z.string().trim().min(1).max(200),
  rank: z.number().int().min(0).max(100).default(0),
});
export type CreateOrgUnitTypeInput = z.infer<typeof createOrgUnitTypeSchema>;

export const updateOrgUnitTypeSchema = createOrgUnitTypeSchema.partial();
export type UpdateOrgUnitTypeInput = z.infer<typeof updateOrgUnitTypeSchema>;

// ============================================================
// Bộ loại đơn vị mẫu (khởi tạo nhanh theo loại hình doanh nghiệp)
// ============================================================

export interface UnitTypePreset {
  key: string;
  label: string;
  description: string;
  /** Các tầng từ cao → thấp (rank tăng dần). */
  types: { code: string; name: string; rank: number }[];
}

export const UNIT_TYPE_PRESETS = [
  {
    key: 'MANUFACTURING_GROUP',
    label: 'Tập đoàn sản xuất',
    description:
      'Tập đoàn → Ngành → Chuỗi → Tổ hợp → Công ty thành viên → Nhà máy → Phân xưởng → Phòng ban → Tổ sản xuất',
    types: [
      { code: 'TAP_DOAN', name: 'Tập đoàn', rank: 0 },
      { code: 'NGANH', name: 'Ngành', rank: 1 },
      { code: 'CHUOI', name: 'Chuỗi', rank: 2 },
      { code: 'TO_HOP', name: 'Tổ hợp', rank: 3 },
      { code: 'CONG_TY_TV', name: 'Công ty thành viên', rank: 4 },
      { code: 'NHA_MAY', name: 'Nhà máy', rank: 5 },
      { code: 'PHAN_XUONG', name: 'Phân xưởng', rank: 6 },
      { code: 'PHONG_BAN', name: 'Phòng ban', rank: 7 },
      { code: 'TO_SX', name: 'Tổ sản xuất', rank: 8 },
    ],
  },
  {
    key: 'SOFTWARE_COMPANY',
    label: 'Công ty phần mềm',
    description: 'Công ty → Khối → Trung tâm → Phòng → Nhóm (Team/Squad)',
    types: [
      { code: 'CONG_TY', name: 'Công ty', rank: 0 },
      { code: 'KHOI', name: 'Khối', rank: 1 },
      { code: 'TRUNG_TAM', name: 'Trung tâm', rank: 2 },
      { code: 'PHONG', name: 'Phòng', rank: 3 },
      { code: 'NHOM', name: 'Nhóm', rank: 4 },
    ],
  },
  {
    key: 'LLC',
    label: 'Công ty TNHH',
    description: 'Công ty → Phòng ban → Bộ phận → Tổ/Nhóm',
    types: [
      { code: 'CONG_TY', name: 'Công ty', rank: 0 },
      { code: 'PHONG_BAN', name: 'Phòng ban', rank: 1 },
      { code: 'BO_PHAN', name: 'Bộ phận', rank: 2 },
      { code: 'TO_NHOM', name: 'Tổ/Nhóm', rank: 3 },
    ],
  },
  {
    key: 'VIETJET_GROUP',
    label: 'Tập đoàn hàng không (kiểu Vietjet Air)',
    description: 'Tập đoàn → Công ty/Hãng → Khối → Ban → Trung tâm → Phòng → Đội/Tổ',
    types: [
      { code: 'TAP_DOAN', name: 'Tập đoàn', rank: 0 },
      { code: 'CONG_TY', name: 'Công ty / Hãng', rank: 1 },
      { code: 'KHOI', name: 'Khối', rank: 2 },
      { code: 'BAN', name: 'Ban', rank: 3 },
      { code: 'TRUNG_TAM', name: 'Trung tâm', rank: 4 },
      { code: 'PHONG', name: 'Phòng', rank: 5 },
      { code: 'DOI_TO', name: 'Đội/Tổ', rank: 6 },
    ],
  },
] as const satisfies readonly UnitTypePreset[];

export type UnitTypePresetKey = (typeof UNIT_TYPE_PRESETS)[number]['key'];

export const seedUnitTypePresetSchema = z.object({
  preset: z.enum(
    UNIT_TYPE_PRESETS.map((p) => p.key) as [UnitTypePresetKey, ...UnitTypePresetKey[]],
  ),
});
export type SeedUnitTypePresetInput = z.infer<typeof seedUnitTypePresetSchema>;

// ============================================================
// OrgUnit
// ============================================================

const unitCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, 'Code chỉ gồm chữ, số, gạch dưới, gạch ngang');

export const orgUnitSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  typeId: z.uuid(),
  typeCode: z.string(),
  typeName: z.string(),
  name: z.string(),
  code: z.string(),
  path: z.string(),
  managerId: z.uuid().nullable(),
});
export type OrgUnitResponse = z.infer<typeof orgUnitSchema>;

export const createOrgUnitSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: unitCodeSchema,
  typeId: z.uuid(),
  /** Null/bỏ trống = tạo node gốc. */
  parentId: z.uuid().nullish(),
});
export type CreateOrgUnitInput = z.infer<typeof createOrgUnitSchema>;

export const updateOrgUnitSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  code: unitCodeSchema.optional(),
  typeId: z.uuid().optional(),
  /** Employee.id — validate từ Phase 2. */
  managerId: z.uuid().nullable().optional(),
});
export type UpdateOrgUnitInput = z.infer<typeof updateOrgUnitSchema>;

export const moveOrgUnitSchema = z.object({
  /** Null = chuyển thành node gốc. */
  parentId: z.uuid().nullable(),
});
export type MoveOrgUnitInput = z.infer<typeof moveOrgUnitSchema>;

// ============================================================
// Position
// ============================================================

export const positionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  level: z.number().int(),
});
export type PositionResponse = z.infer<typeof positionSchema>;

export const createPositionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: unitCodeSchema,
  /** Cấp bậc (1 = thấp nhất) — chính sách phép theo cấp + định tuyến duyệt. */
  level: z.number().int().min(1).max(100).default(1),
});
export type CreatePositionInput = z.infer<typeof createPositionSchema>;

export const updatePositionSchema = createPositionSchema.partial();
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;

// ============================================================
// Worksite
// ============================================================

export const worksiteSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  radiusM: z.number().int(),
  requireFace: z.boolean(),
  requireLocation: z.boolean(),
});
export type WorksiteResponse = z.infer<typeof worksiteSchema>;

export const createWorksiteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).nullish(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(10).max(10_000).default(100),
  requireFace: z.boolean().default(false),
  requireLocation: z.boolean().default(true),
});
export type CreateWorksiteInput = z.infer<typeof createWorksiteSchema>;

export const updateWorksiteSchema = createWorksiteSchema.partial();
export type UpdateWorksiteInput = z.infer<typeof updateWorksiteSchema>;
