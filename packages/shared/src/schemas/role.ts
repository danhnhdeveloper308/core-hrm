import { z } from 'zod';
import { paginationQuerySchema } from './common';
import { permissionSchema } from './user';

export const roleResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(permissionSchema),
  userCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Tên role tối thiểu 2 ký tự')
    .max(50)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Tên role: CHỮ_HOA, số và gạch dưới, vd CONTENT_EDITOR'),
  description: z.string().trim().max(255).optional(),
});

export const updateRoleSchema = createRoleSchema.partial();

export const setRolePermissionsSchema = z.object({
  /** Danh sách permission đầy đủ sau thay đổi (replace). */
  permissions: z.array(permissionSchema),
});

export const listRolesQuerySchema = paginationQuerySchema;

export type RoleResponse = z.infer<typeof roleResponseSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;
export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;
