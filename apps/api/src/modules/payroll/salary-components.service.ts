import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateSalaryComponentInput,
  type CursorPaginated,
  type ListSalaryComponentsQuery,
  type SalaryComponentResponse,
  type UpdateSalaryComponentInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type ComponentRow = Prisma.SalaryComponentGetPayload<object>;

function toResponse(c: ComponentRow): SalaryComponentResponse {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    kind: c.kind,
    taxable: c.taxable,
    insurance: c.insurance,
    defaultAmount: c.defaultAmount,
    order: c.order,
    active: c.active,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Cấu phần lương (catalog phụ cấp / khấu trừ). */
@Injectable()
export class SalaryComponentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    orgId: string,
    query: ListSalaryComponentsQuery,
  ): Promise<CursorPaginated<SalaryComponentResponse>> {
    const where: Prisma.SalaryComponentWhereInput = {
      orgId,
      ...(query.active !== undefined ? { active: query.active } : {}),
    };
    const rows = await this.prisma.salaryComponent.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
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
    input: CreateSalaryComponentInput,
  ): Promise<SalaryComponentResponse> {
    const dup = await this.prisma.salaryComponent.findFirst({
      where: { orgId, code: input.code },
      select: { id: true },
    });
    if (dup) {
      throw new AppException(
        HttpStatus.CONFLICT,
        `Mã cấu phần "${input.code}" đã tồn tại`,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const created = await this.prisma.salaryComponent.create({
      data: {
        orgId,
        code: input.code,
        name: input.name,
        kind: input.kind,
        taxable: input.taxable,
        insurance: input.insurance,
        defaultAmount: input.defaultAmount ?? null,
        order: input.order,
      },
    });
    addAuditMetadata({ after: { code: input.code, name: input.name } });
    return toResponse(created);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateSalaryComponentInput,
  ): Promise<SalaryComponentResponse> {
    await this.require(orgId, id);
    const updated = await this.prisma.salaryComponent.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.taxable !== undefined ? { taxable: input.taxable } : {}),
        ...(input.insurance !== undefined ? { insurance: input.insurance } : {}),
        ...(input.defaultAmount !== undefined
          ? { defaultAmount: input.defaultAmount }
          : {}),
        ...(input.order !== undefined ? { order: input.order } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    addAuditMetadata({ after: { name: updated.name } });
    return toResponse(updated);
  }

  async remove(orgId: string, id: string): Promise<{ id: string }> {
    const existing = await this.require(orgId, id);
    await this.prisma.salaryComponent.delete({ where: { id } });
    addAuditMetadata({ before: { code: existing.code } });
    return { id };
  }

  private async require(orgId: string, id: string): Promise<ComponentRow> {
    const c = await this.prisma.salaryComponent.findFirst({
      where: { id, orgId },
    });
    if (!c) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy cấu phần lương',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return c;
  }
}
