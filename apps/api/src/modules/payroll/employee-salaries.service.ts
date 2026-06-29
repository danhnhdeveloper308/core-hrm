import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  salaryLineSchema,
  type CreateEmployeeSalaryInput,
  type CursorPaginated,
  type EmployeeSalaryResponse,
  type ListEmployeeSalariesQuery,
  type SalaryLine,
} from '@repo/shared';
import { z } from 'zod';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const INCLUDE = {
  employee: { select: { fullName: true } },
} as const;

type SalaryRow = Prisma.EmployeeSalaryGetPayload<{ include: typeof INCLUDE }>;

const linesSchema = z.array(salaryLineSchema);

function parseComponents(json: Prisma.JsonValue | null): SalaryLine[] {
  const parsed = linesSchema.safeParse(json);
  return parsed.success ? parsed.data : [];
}

function toResponse(s: SalaryRow): EmployeeSalaryResponse {
  return {
    id: s.id,
    employeeId: s.employeeId,
    employeeName: s.employee?.fullName ?? null,
    baseSalary: s.baseSalary,
    insuranceSalary: s.insuranceSalary,
    components: parseComponents(s.componentsJson),
    effectiveDate: s.effectiveDate.toISOString().slice(0, 10),
    note: s.note,
    createdAt: s.createdAt.toISOString(),
  };
}

/** Lương theo NV — versioned. Không employeeId → bản hiệu lực mới nhất mỗi NV. */
@Injectable()
export class EmployeeSalariesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    orgId: string,
    query: ListEmployeeSalariesQuery,
  ): Promise<CursorPaginated<EmployeeSalaryResponse>> {
    // Không employeeId → roster bản mới-nhất-mỗi-NV (distinct), 1 trang.
    if (!query.employeeId) {
      const rows = await this.prisma.employeeSalary.findMany({
        where: { orgId, employee: { is: { deletedAt: null } } },
        include: INCLUDE,
        orderBy: [{ employeeId: 'asc' }, { effectiveDate: 'desc' }],
        distinct: ['employeeId'],
      });
      return { items: rows.map(toResponse), nextCursor: null };
    }
    // Có employeeId → lịch sử các bản của NV đó (phân trang cursor).
    const rows = await this.prisma.employeeSalary.findMany({
      where: {
        orgId,
        employeeId: query.employeeId,
        employee: { is: { deletedAt: null } },
      },
      include: INCLUDE,
      orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
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

  /** Lưu 1 bản lương (upsert theo [employeeId, effectiveDate]). */
  async create(
    orgId: string,
    input: CreateEmployeeSalaryInput,
  ): Promise<EmployeeSalaryResponse> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Nhân viên không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const effectiveDate = new Date(input.effectiveDate);
    const components = input.components as Prisma.InputJsonValue;
    const saved = await this.prisma.employeeSalary.upsert({
      where: {
        employeeId_effectiveDate: {
          employeeId: input.employeeId,
          effectiveDate,
        },
      },
      create: {
        orgId,
        employeeId: input.employeeId,
        baseSalary: input.baseSalary,
        insuranceSalary: input.insuranceSalary ?? null,
        componentsJson: components,
        effectiveDate,
        note: input.note ?? null,
      },
      update: {
        baseSalary: input.baseSalary,
        insuranceSalary: input.insuranceSalary ?? null,
        componentsJson: components,
        note: input.note ?? null,
      },
      include: INCLUDE,
    });
    addAuditMetadata({
      after: { employeeId: input.employeeId, baseSalary: input.baseSalary },
    });
    return toResponse(saved);
  }

  async remove(orgId: string, id: string): Promise<{ id: string }> {
    const existing = await this.prisma.employeeSalary.findFirst({
      where: { id, orgId },
      select: { id: true },
    });
    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy bản lương',
        ERROR_CODES.NOT_FOUND,
      );
    }
    await this.prisma.employeeSalary.delete({ where: { id } });
    addAuditMetadata({ before: { id } });
    return { id };
  }
}
