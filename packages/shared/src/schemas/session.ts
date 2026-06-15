import { z } from 'zod';

export const sessionRevokeReasonSchema = z.enum([
  'USER_LOGOUT',
  'USER_LOGOUT_ALL',
  'ROTATED',
  'TOKEN_REUSE',
  'ADMIN_REVOKED',
  'PASSWORD_RESET',
  'USER_BANNED',
  'EXPIRED',
]);
export type SessionRevokeReason = z.infer<typeof sessionRevokeReasonSchema>;

export const sessionResponseSchema = z.object({
  id: z.uuid(),
  deviceName: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  lastActiveAt: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  /** Session đang được dùng để gọi request này. */
  isCurrent: z.boolean(),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
