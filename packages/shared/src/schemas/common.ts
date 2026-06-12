import { z } from 'zod';

/** Query phân trang dùng chung cho mọi danh sách (page-based). */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Format `field:asc|desc`, vd `createdAt:desc`. */
  sort: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9]*:(asc|desc)$/, 'sort phải có dạng field:asc|desc')
    .optional(),
  search: z.string().trim().max(255).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const messageResponseSchema = z.object({
  message: z.string(),
});

export type MessageResponse = z.infer<typeof messageResponseSchema>;

/** Parse `sort` thành { field, direction } — trả về null nếu không truyền. */
export function parseSort(
  sort: string | undefined,
  allowedFields: readonly string[],
): { field: string; direction: 'asc' | 'desc' } | null {
  if (!sort) return null;
  const [field, direction] = sort.split(':');
  if (!field || !allowedFields.includes(field)) return null;
  return { field, direction: direction === 'asc' ? 'asc' : 'desc' };
}
