import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateKpiDefinitionInput,
  type CursorPaginated,
  type KpiDefinitionResponse,
  type ListKpiDefinitionsQuery,
  type UpdateKpiDefinitionInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type KpiRow = Prisma.KpiDefinitionGetPayload<object>;

function toResponse(k: KpiRow): KpiDefinitionResponse {
  return {
    id: k.id,
    name: k.name,
    category: k.category,
    unit: k.unit,
    direction: k.direction,
    defaultWeight: k.defaultWeight,
    description: k.description,
    active: k.active,
    createdAt: k.createdAt.toISOString(),
  };
}

/** Thư viện KPI dùng lại — chuẩn hoá đơn vị + chiều "tốt" cho mục tiêu. */
@Injectable()
export class KpiDefinitionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    orgId: string,
    query: ListKpiDefinitionsQuery,
  ): Promise<CursorPaginated<KpiDefinitionResponse>> {
    const where: Prisma.KpiDefinitionWhereInput = {
      orgId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const rows = await this.prisma.kpiDefinition.findMany({
      where,
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
    input: CreateKpiDefinitionInput,
  ): Promise<KpiDefinitionResponse> {
    const created = await this.prisma.kpiDefinition.create({
      data: {
        orgId,
        name: input.name,
        category: input.category ?? null,
        unit: input.unit ?? null,
        direction: input.direction,
        defaultWeight: input.defaultWeight,
        description: input.description ?? null,
      },
    });
    addAuditMetadata({ after: { name: input.name } });
    return toResponse(created);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateKpiDefinitionInput,
  ): Promise<KpiDefinitionResponse> {
    await this.require(orgId, id);
    const updated = await this.prisma.kpiDefinition.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.direction !== undefined ? { direction: input.direction } : {}),
        ...(input.defaultWeight !== undefined
          ? { defaultWeight: input.defaultWeight }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    addAuditMetadata({ after: { name: updated.name } });
    return toResponse(updated);
  }

  async remove(orgId: string, id: string): Promise<{ id: string }> {
    const existing = await this.require(orgId, id);
    await this.prisma.kpiDefinition.delete({ where: { id } });
    addAuditMetadata({ before: { name: existing.name } });
    return { id };
  }

  private async require(orgId: string, id: string): Promise<KpiRow> {
    const k = await this.prisma.kpiDefinition.findFirst({
      where: { id, orgId },
    });
    if (!k) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy KPI',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return k;
  }
}
