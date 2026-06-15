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
});
export type PositionResponse = z.infer<typeof positionSchema>;

export const createPositionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: unitCodeSchema,
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
