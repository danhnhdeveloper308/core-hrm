import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateEmployeeBenefitInput,
  type CursorPaginated,
  type EmployeeBenefitResponse,
  type ListEmployeeBenefitsQuery,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const INCLUDE = {
  benefitPlan: { select: { name: true, category: true, amount: true, taxable: true } },
  employee: { select: { fullName: true } },
} as const;

type BenefitRow = Prisma.EmployeeBenefitGetPayload<{ include: typeof INCLUDE }>;

const dateOnly = (d: Date | null): string | null =>
  d ? d.toISOString().slice(0, 10) : null;

function toResponse(b: BenefitRow): EmployeeBenefitResponse {
  return {
    id: b.id,
    benefitPlanId: b.benefitPlanId,
    planName: b.benefitPlan?.name ?? null,
    category: b.benefitPlan?.category ?? null,
    employeeId: b.employeeId,
    employeeName: b.employee?.fullName ?? null,
    amount: b.amount ?? b.benefitPlan?.amount ?? 0,
    taxable: b.benefitPlan?.taxable ?? false,
    startDate: dateOnly(b.startDate),
    endDate: dateOnly(b.endDate),
    createdAt: b.createdAt.toISOString(),
  };
}

/** Gán phúc lợi cho NV (override số tiền + thời hạn). */
@Injectable()
export class EmployeeBenefitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    orgId: string,
    query: ListEmployeeBenefitsQuery,
  ): Promise<CursorPaginated<EmployeeBenefitResponse>> {
    const where: Prisma.EmployeeBenefitWhereInput = {
      orgId,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.benefitPlanId ? { benefitPlanId: query.benefitPlanId } : {}),
      employee: { is: { deletedAt: null } },
    };
    const rows = await this.prisma.employeeBenefit.findMany({
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
    input: CreateEmployeeBenefitInput,
  ): Promise<EmployeeBenefitResponse> {
    const [plan, employee] = await Promise.all([
      this.prisma.benefitPlan.findFirst({
        where: { id: input.benefitPlanId, orgId },
        select: { id: true },
      }),
      this.prisma.employee.findFirst({
        where: { id: input.employeeId, orgId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!plan) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Phúc lợi không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    if (!employee) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Nhân viên không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const saved = await this.prisma.employeeBenefit.upsert({
      where: {
        benefitPlanId_employeeId: {
          benefitPlanId: input.benefitPlanId,
          employeeId: input.employeeId,
        },
      },
      create: {
        orgId,
        benefitPlanId: input.benefitPlanId,
        employeeId: input.employeeId,
        amount: input.amount ?? null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
      },
      update: {
        amount: input.amount ?? null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
      },
      include: INCLUDE,
    });
    addAuditMetadata({
      after: { benefitPlanId: input.benefitPlanId, employeeId: input.employeeId },
    });
    return toResponse(saved);
  }

  async remove(orgId: string, id: string): Promise<{ id: string }> {
    const existing = await this.prisma.employeeBenefit.findFirst({
      where: { id, orgId },
      select: { id: true },
    });
    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy phúc lợi đã gán',
        ERROR_CODES.NOT_FOUND,
      );
    }
    await this.prisma.employeeBenefit.delete({ where: { id } });
    addAuditMetadata({ before: { id } });
    return { id };
  }
}
