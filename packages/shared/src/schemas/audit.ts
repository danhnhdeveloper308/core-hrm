import { z } from 'zod';

export const auditLogSchema = z.object({
  id: z.uuid(),
  /** Null = hành động cấp platform; có giá trị = thuộc tenant nào. */
  orgId: z.uuid().nullable(),
  actorId: z.uuid().nullable(),
  actorEmail: z.string().nullable(),
  /** Dạng `resource.action`, vd `user.update`, `auth.login`. */
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** Diff/context đã được redact các field nhạy cảm. */
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});

/** Cursor pagination — phục vụ infinite scroll + virtual list. */
export const auditQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Lọc theo tenant — chỉ platform admin dùng; org user bị ép về org mình ở backend. */
  orgId: z.uuid().optional(),
  actorId: z.uuid().optional(),
  resource: z.string().trim().max(100).optional(),
  action: z.string().trim().max(100).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
