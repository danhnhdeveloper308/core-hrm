import type {
  AuditQuery,
  ListLeaveRequestsQuery,
  ListRolesQuery,
  ListUsersQuery,
} from '@repo/shared';

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

  employees: {
    all: ['employees'] as const,
    list: (filters: Record<string, unknown>) =>
      ['employees', 'list', filters] as const,
    detail: (id: string) => ['employees', 'detail', id] as const,
    me: ['employees', 'me'] as const,
    dependents: (id: string) => ['employees', 'dependents', id] as const,
  },

  org: {
    info: ['org', 'info'] as const,
    units: ['org', 'units'] as const,
    unitTypes: ['org', 'unit-types'] as const,
    positions: ['org', 'positions'] as const,
    worksites: ['org', 'worksites'] as const,
    shifts: ['org', 'shifts'] as const,
    calendars: ['org', 'calendars'] as const,
    holidays: (calendarId: string) => ['org', 'holidays', calendarId] as const,
    shiftAssignments: (employeeId: string) =>
      ['org', 'shift-assignments', employeeId] as const,
  },

  leave: {
    types: ['leave', 'types'] as const,
    policies: ['leave', 'policies'] as const,
    balanceMe: (year: number) => ['leave', 'balance', 'me', year] as const,
    ledgerMe: (year: number) => ['leave', 'ledger', 'me', year] as const,
    balanceOf: (employeeId: string, year: number) =>
      ['leave', 'balance', employeeId, year] as const,
    requests: (query: Partial<ListLeaveRequestsQuery>) =>
      ['leave', 'requests', query] as const,
  },

  approval: {
    flows: (targetType?: string) => ['approval', 'flows', targetType ?? 'all'] as const,
    inbox: ['approval', 'inbox'] as const,
    history: ['approval', 'history'] as const,
    instance: (id: string) => ['approval', 'instance', id] as const,
  },

  shiftRegistrations: {
    all: ['shift-registrations'] as const,
    detail: (id: string) => ['shift-registrations', id] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: (unreadOnly: boolean) => ['notifications', 'list', unreadOnly] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
    preferences: ['notifications', 'preferences'] as const,
  },

  reports: {
    dashboard: ['reports', 'dashboard'] as const,
    /** Org chart lazy theo nhánh: 1 cache/parent (root = cấp gốc). */
    orgChart: (mode: string, parentId: string | null) =>
      ['reports', 'org-chart', mode, parentId ?? 'root'] as const,
    attendanceDashboard: (filters: Record<string, unknown>) =>
      ['reports', 'attendance-dashboard', filters] as const,
  },
} as const;
