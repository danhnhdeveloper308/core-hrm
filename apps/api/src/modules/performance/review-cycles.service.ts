import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateReviewCycleInput,
  type CursorPaginated,
  type ListReviewCyclesQuery,
  type ReviewCycleResponse,
  type UpdateReviewCycleInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);

const INCLUDE = {
  _count: { select: { goals: true } },
} as const;

type CycleRow = Prisma.ReviewCycleGetPayload<{ include: typeof INCLUDE }>;

function toResponse(c: CycleRow): ReviewCycleResponse {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    periodStart: dateOnly(c.periodStart),
    periodEnd: dateOnly(c.periodEnd),
    status: c.status,
    goalCount: c._count.goals,
    // reviewCount nối ở P-D.3 (PerformanceReview)
    reviewCount: 0,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Chu kỳ đánh giá: khung thời gian cho mục tiêu / đánh giá / 360°. */
@Injectable()
export class ReviewCyclesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    orgId: string,
    query: ListReviewCyclesQuery,
  ): Promise<CursorPaginated<ReviewCycleResponse>> {
    const rows = await this.prisma.reviewCycle.findMany({
      where: { orgId, ...(query.status ? { status: query.status } : {}) },
      include: INCLUDE,
      orderBy: [{ periodStart: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: items.map((c) => toResponse(c)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async create(
    orgId: string,
    input: CreateReviewCycleInput,
  ): Promise<ReviewCycleResponse> {
    const created = await this.prisma.reviewCycle.create({
      data: {
        orgId,
        name: input.name,
        type: input.type,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { name: input.name, type: input.type } });
    return toResponse(created);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateReviewCycleInput,
  ): Promise<ReviewCycleResponse> {
    const existing = await this.require(orgId, id);
    const updated = await this.prisma.reviewCycle.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.periodStart !== undefined
          ? { periodStart: new Date(input.periodStart) }
          : {}),
        ...(input.periodEnd !== undefined
          ? { periodEnd: new Date(input.periodEnd) }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: INCLUDE,
    });
    addAuditMetadata({
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return toResponse(updated);
  }

  async remove(orgId: string, id: string): Promise<{ id: string }> {
    const existing = await this.require(orgId, id);
    if (existing.status !== 'DRAFT') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Chỉ xoá được chu kỳ ở trạng thái nháp',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    await this.prisma.reviewCycle.delete({ where: { id } });
    addAuditMetadata({ before: { name: existing.name } });
    return { id };
  }

  private async require(orgId: string, id: string): Promise<CycleRow> {
    const c = await this.prisma.reviewCycle.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!c) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy chu kỳ đánh giá',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return c;
  }
}
