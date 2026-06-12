import type { Permission, UserResponse } from '@repo/shared';
import type { Role, User, UserRole } from '../../prisma/prisma.types';

export type UserWithRoles = User & { roles: (UserRole & { role: Role })[] };

/** Map Prisma User → shape public cho FE — không bao giờ lộ hash/secret. */
export function toUserResponse(user: UserWithRoles): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    totpEnabled: user.totpEnabled,
    roles: user.roles.map(({ role }) => ({ id: role.id, name: role.name })),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export const USER_WITH_ROLES_INCLUDE = {
  roles: { include: { role: true } },
} as const;

export function toMeResponse(
  user: UserWithRoles,
  permissions: Permission[],
  sessionId: string,
) {
  return { ...toUserResponse(user), permissions, sessionId };
}
