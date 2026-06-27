import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type ContractListItem,
  type CreateOrgContractInput,
  type CursorPaginated,
  type ListContractsQuery,
  type TerminateContractInput,
  type UpdateContractInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeesService } from '../employees/employees.service';
import { toContractListItem } from './contract.mapper';

const CONTRACT_INCLUDE = {
  employee: {
    select: { code: true, fullName: true, orgUnit: { select: { name: true } } },
  },
} as const;

/** Quản lý hợp đồng lao động cấp tổ chức (danh sách + CRUD + chấm dứt). */
@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
  ) {}

  async list(
    orgId: string,
    actor: AccessTokenPayload,
    query: ListContractsQuery,
  ): Promise<CursorPaginated<ContractListItem>> {
    const scopePaths = await this.employees.resolveScopePaths(actor);
    const and: Prisma.EmploymentContractWhereInput[] = [];

    if (query.expiringInDays) {
      const now = new Date();
      const until = new Date(now.getTime() + query.expiringInDays * 86_400_000);
      and.push({
        endDate: { gte: now, lte: until },
        status: { notIn: ['TERMINATED'] },
      });
    }
    if (scopePaths) {
      and.push({
        employee: {
          is: {
            OR: [
              ...scopePaths.map((p) => ({
                orgUnit: { is: { path: { startsWith: p } } },
              })),
              { userId: actor.sub },
            ],
          },
        },
      });
    }
    if (query.search) {
      and.push({
        OR: [
          { code: { contains: query.search, mode: 'insensitive' } },
          {
            employee: {
              is: {
                OR: [
                  { fullName: { contains: query.search, mode: 'insensitive' } },
                  { code: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      });
    }

    const where: Prisma.EmploymentContractWhereInput = {
      orgId,
      deletedAt: null,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(and.length ? { AND: and } : {}),
    };

    const rows = await this.prisma.employmentContract.findMany({
      where,
      include: CONTRACT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: items.map(toContractListItem),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async get(orgId: string, id: string): Promise<ContractListItem> {
    const contract = await this.prisma.employmentContract.findFirst({
      where: { id, orgId, deletedAt: null },
      include: CONTRACT_INCLUDE,
    });
    if (!contract) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy hợp đồng',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return toContractListItem(contract);
  }

  async create(
    orgId: string,
    input: CreateOrgContractInput,
  ): Promise<ContractListItem> {
    const emp = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!emp) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy nhân viên',
        ERROR_CODES.NOT_FOUND,
      );
    }
    if (input.code) await this.assertCodeFree(orgId, input.code);

    const contract = await this.prisma.employmentContract.create({
      data: {
        orgId,
        employeeId: input.employeeId,
        type: input.type,
        code: input.code ?? null,
        status: input.status ?? 'DRAFT',
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        signedDate: input.signedDate ? new Date(input.signedDate) : null,
        baseSalary: input.baseSalary ?? null,
        allowanceJson: input.allowances ?? undefined,
        parentId: input.parentId ?? null,
        note: input.note ?? null,
      },
      include: CONTRACT_INCLUDE,
    });
    addAuditMetadata({
      after: { code: contract.code, type: contract.type, employeeId: input.employeeId },
    });
    return toContractListItem(contract);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateContractInput,
  ): Promise<ContractListItem> {
    const existing = await this.requireContract(orgId, id);
    if (input.code && input.code !== existing.code) {
      await this.assertCodeFree(orgId, input.code, id);
    }
    const contract = await this.prisma.employmentContract.update({
      where: { id },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.startDate !== undefined
          ? { startDate: new Date(input.startDate) }
          : {}),
        ...(input.endDate !== undefined
          ? { endDate: input.endDate ? new Date(input.endDate) : null }
          : {}),
        ...(input.signedDate !== undefined
          ? { signedDate: input.signedDate ? new Date(input.signedDate) : null }
          : {}),
        ...(input.baseSalary !== undefined ? { baseSalary: input.baseSalary } : {}),
        ...(input.allowances !== undefined
          ? { allowanceJson: input.allowances ?? Prisma.JsonNull }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
      include: CONTRACT_INCLUDE,
    });
    addAuditMetadata({
      before: { status: existing.status, baseSalary: existing.baseSalary },
      after: { status: contract.status, baseSalary: contract.baseSalary },
    });
    return toContractListItem(contract);
  }

  async terminate(
    orgId: string,
    id: string,
    input: TerminateContractInput,
  ): Promise<ContractListItem> {
    const existing = await this.requireContract(orgId, id);
    const contract = await this.prisma.employmentContract.update({
      where: { id },
      data: {
        status: 'TERMINATED',
        terminateDate: new Date(input.terminateDate),
        terminateReason: input.reason,
      },
      include: CONTRACT_INCLUDE,
    });
    addAuditMetadata({
      before: { status: existing.status },
      after: { status: 'TERMINATED', terminateDate: input.terminateDate },
    });
    return toContractListItem(contract);
  }

  async remove(orgId: string, id: string): Promise<{ message: string }> {
    const existing = await this.requireContract(orgId, id);
    await this.prisma.employmentContract.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    addAuditMetadata({ before: { code: existing.code, status: existing.status } });
    return { message: 'Đã xoá hợp đồng' };
  }

  // ===== helpers =====

  private async requireContract(orgId: string, id: string) {
    const contract = await this.prisma.employmentContract.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!contract) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy hợp đồng',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return contract;
  }

  private async assertCodeFree(orgId: string, code: string, excludeId?: string) {
    const taken = await this.prisma.employmentContract.findFirst({
      where: { orgId, code, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (taken) {
      throw new AppException(
        HttpStatus.CONFLICT,
        `Số hợp đồng "${code}" đã tồn tại`,
        ERROR_CODES.ORG_CODE_TAKEN,
      );
    }
  }
}
