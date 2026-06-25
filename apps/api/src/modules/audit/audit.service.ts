import { Injectable } from '@nestjs/common';
import type { AuditLog, AuditQuery, CursorPaginated } from '@repo/shared';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toAuditLogResponse } from '../../queues/audit.queue';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cursor pagination (id làm cursor, order createdAt desc) — cho infinite scroll.
   * actorOrgId: orgId của người xem. != null (org user) → ÉP chỉ thấy log org mình;
   * null (platform admin) → thấy tất cả, có thể lọc theo query.orgId.
   */
  async list(
    query: AuditQuery,
    actorOrgId: string | null,
  ): Promise<CursorPaginated<AuditLog>> {
    const orgScope = actorOrgId ?? query.orgId;
    const where: Prisma.AuditLogWhereInput = {
      ...(orgScope ? { orgId: orgScope } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.resource ? { resource: query.resource } : {}),
      ...(query.action
        ? { action: { contains: query.action, mode: 'insensitive' } }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: items.map(toAuditLogResponse),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }
}
