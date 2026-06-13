import type { AuditQuery, ListRolesQuery, ListUsersQuery } from '@repo/shared';

/** Factory query keys tập trung — invalidate theo prefix, không gõ chuỗi tay. */
export const queryKeys = {
  me: ['me'] as const,

  users: {
    all: ['users'] as const,
    list: (query: Partial<ListUsersQuery>) => ['users', 'list', query] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
  },

  roles: {
    all: ['roles'] as const,
    list: (query: Partial<ListRolesQuery>) => ['roles', 'list', query] as const,
    detail: (id: string) => ['roles', 'detail', id] as const,
  },

  permissions: ['permissions'] as const,

  sessions: {
    mine: ['sessions', 'mine'] as const,
    user: (userId: string) => ['sessions', 'user', userId] as const,
  },

  audit: {
    list: (filters: Partial<Omit<AuditQuery, 'cursor'>>) =>
      ['audit', 'list', filters] as const,
  },

  organizations: {
    all: ['organizations'] as const,
    list: (query: Record<string, unknown>) =>
      ['organizations', 'list', query] as const,
  },

  org: {
    info: ['org', 'info'] as const,
    units: ['org', 'units'] as const,
    unitTypes: ['org', 'unit-types'] as const,
    positions: ['org', 'positions'] as const,
    worksites: ['org', 'worksites'] as const,
  },
} as const;
