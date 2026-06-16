import { z } from 'zod';
import { ALL_PERMISSIONS } from '../constants/permissions';
import { paginationQuerySchema } from './common';

export const userStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'BANNED']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const permissionSchema = z.enum(ALL_PERMISSIONS);

export const userRoleRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

/** Shape user trả về cho FE — không bao giờ chứa passwordHash/totpSecret. */
export const userResponseSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  username: z.string().nullable(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  status: userStatusSchema,
  emailVerifiedAt: z.string().nullable(),
  totpEnabled: z.boolean(),
  roles: z.array(userRoleRefSchema),
  /** Null = platform admin. */
  orgId: z.uuid().nullable(),
  org: z
    .object({ id: z.uuid(), name: z.string(), slug: z.string(), timezone: z.string() })
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** /auth/me — kèm permissions đã resolve từ roles. */
export const meResponseSchema = userResponseSchema.extend({
  permissions: z.array(permissionSchema),
  sessionId: z.uuid(),
});

export const listUsersQuerySchema = paginationQuerySchema.extend({
  status: userStatusSchema.optional(),
  roleId: z.uuid().optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  avatarUrl: z.url().nullable().optional(),
});

export const updateUserStatusSchema = z.object({
  status: userStatusSchema,
  reason: z.string().trim().max(500).optional(),
});

export const assignRolesSchema = z.object({
  /** Danh sách roleId đầy đủ sau thay đổi (replace, không phải append). */
  roleIds: z.array(z.uuid()),
});

export type UserRoleRef = z.infer<typeof userRoleRefSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
