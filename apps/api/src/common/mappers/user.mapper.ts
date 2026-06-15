import type { Permission, UserResponse } from '@repo/shared';
import type { Organization, Role, User, UserRole } from '../../prisma/prisma.types';

export type UserWithRoles = User & {
  roles: (UserRole & { role: Role })[];
  org?: Organization | null;
};

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
    orgId: user.orgId,
    org: user.org
      ? {
          id: user.org.id,
          name: user.org.name,
          slug: user.org.slug,
          timezone: user.org.timezone,
        }
      : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export const USER_WITH_ROLES_INCLUDE = {
  roles: { include: { role: true } },
  org: true,
} as const;

export function toMeResponse(
  user: UserWithRoles,
  permissions: Permission[],
  sessionId: string,
) {
  return { ...toUserResponse(user), permissions, sessionId };
}
