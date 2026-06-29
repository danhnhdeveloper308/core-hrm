import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type BenefitPlanResponse,
  type CreateBenefitPlanInput,
  type CursorPaginated,
  type ListBenefitPlansQuery,
  type UpdateBenefitPlanInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const INCLUDE = {
  _count: { select: { employeeBenefits: true } },
} as const;

type PlanRow = Prisma.BenefitPlanGetPayload<{ include: typeof INCLUDE }>;

function toResponse(p: PlanRow): BenefitPlanResponse {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    amount: p.amount,
    taxable: p.taxable,
    active: p.active,
    assignedCount: p._count.employeeBenefits,
    createdAt: p.createdAt.toISOString(),
  };
}

/** Phúc lợi định kỳ (catalog). Gán cho NV qua EmployeeBenefitsService. */
@Injectable()
export class BenefitPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    orgId: string,
    query: ListBenefitPlansQuery,
  ): Promise<CursorPaginated<BenefitPlanResponse>> {
    const where: Prisma.BenefitPlanWhereInput = {
      orgId,
      ...(query.active !== undefined ? { active: query.active } : {}),
    };
    const rows = await this.prisma.benefitPlan.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: items.map(toResponse),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async create(
    orgId: string,
    input: CreateBenefitPlanInput,
  ): Promise<BenefitPlanResponse> {
    const created = await this.prisma.benefitPlan.create({
      data: {
        orgId,
        name: input.name,
        category: input.category ?? null,
        amount: input.amount,
        taxable: input.taxable,
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { name: input.name, amount: input.amount } });
    return toResponse(created);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateBenefitPlanInput,
  ): Promise<BenefitPlanResponse> {
    await this.require(orgId, id);
    const updated = await this.prisma.benefitPlan.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.taxable !== undefined ? { taxable: input.taxable } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { name: updated.name } });
    return toResponse(updated);
  }

  async remove(orgId: string, id: string): Promise<{ id: string }> {
    const existing = await this.require(orgId, id);
    await this.prisma.benefitPlan.delete({ where: { id } });
    addAuditMetadata({ before: { name: existing.name } });
    return { id };
  }

  private async require(orgId: string, id: string): Promise<PlanRow> {
    const p = await this.prisma.benefitPlan.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!p) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy phúc lợi',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return p;
  }
}
