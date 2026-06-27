import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateGoalInput,
  type CursorPaginated,
  type GoalResponse,
  type ListGoalsQuery,
  type UpdateGoalInput,
  type UpdateGoalProgressInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeesService } from '../employees/employees.service';

const INCLUDE = {
  employee: { select: { fullName: true } },
  cycle: { select: { name: true } },
  kpiDefinition: { select: { name: true } },
} as const;

type GoalRow = Prisma.GoalGetPayload<{ include: typeof INCLUDE }>;

function toResponse(g: GoalRow): GoalResponse {
  return {
    id: g.id,
    employeeId: g.employeeId,
    employeeName: g.employee?.fullName ?? null,
    cycleId: g.cycleId,
    cycleName: g.cycle?.name ?? null,
    parentId: g.parentId,
    title: g.title,
    description: g.description,
    kpiDefinitionId: g.kpiDefinitionId,
    kpiName: g.kpiDefinition?.name ?? null,
    target: g.target,
    actual: g.actual,
    unit: g.unit,
    weight: g.weight,
    progress: g.progress,
    status: g.status,
    createdAt: g.createdAt.toISOString(),
  };
}

/**
 * Mục tiêu (OKR/MBO). Quyền theo PHẠM VI dữ liệu: bản thân luôn được; quản lý
 * (UNIT_MANAGER) thấy/sửa subtree mình quản lý; HR (ORG_ADMIN/HR_MANAGER) toàn org.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
  ) {}

  async list(
    orgId: string,
    actor: AccessTokenPayload,
    query: ListGoalsQuery,
  ): Promise<CursorPaginated<GoalResponse>> {
    const empWhere = await this.scopeEmployeeWhere(orgId, actor);
    const where: Prisma.GoalWhereInput = {
      orgId,
      ...(query.cycleId ? { cycleId: query.cycleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      employee: {
        is: {
          ...empWhere,
          ...(query.employeeId ? { id: query.employeeId } : {}),
        },
      },
    };
    const rows = await this.prisma.goal.findMany({
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
    actor: AccessTokenPayload,
    input: CreateGoalInput,
  ): Promise<GoalResponse> {
    const employeeId = input.employeeId ?? (await this.ownEmployeeId(orgId, actor));
    await this.assertCanManage(orgId, actor, employeeId);

    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: input.cycleId, orgId },
      select: { id: true },
    });
    if (!cycle) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy chu kỳ đánh giá',
        ERROR_CODES.NOT_FOUND,
      );
    }
    if (input.kpiDefinitionId) {
      await this.assertKpiInOrg(orgId, input.kpiDefinitionId);
    }
    if (input.parentId) {
      await this.assertParentInOrg(orgId, input.parentId);
    }

    const created = await this.prisma.goal.create({
      data: {
        orgId,
        employeeId,
        cycleId: input.cycleId,
        parentId: input.parentId ?? null,
        title: input.title,
        description: input.description ?? null,
        kpiDefinitionId: input.kpiDefinitionId ?? null,
        target: input.target ?? null,
        unit: input.unit ?? null,
        weight: input.weight,
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { title: input.title, employeeId } });
    return toResponse(created);
  }

  async update(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
    input: UpdateGoalInput,
  ): Promise<GoalResponse> {
    const existing = await this.require(orgId, id);
    await this.assertCanManage(orgId, actor, existing.employeeId);
    if (input.kpiDefinitionId) {
      await this.assertKpiInOrg(orgId, input.kpiDefinitionId);
    }
    if (input.parentId) {
      if (input.parentId === id) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Mục tiêu không thể là cấp trên của chính nó',
          ERROR_CODES.VALIDATION_ERROR,
        );
      }
      await this.assertParentInOrg(orgId, input.parentId);
    }
    const updated = await this.prisma.goal.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.kpiDefinitionId !== undefined
          ? { kpiDefinitionId: input.kpiDefinitionId }
          : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.target !== undefined ? { target: input.target } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.weight !== undefined ? { weight: input.weight } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { title: updated.title, status: updated.status } });
    return toResponse(updated);
  }

  async updateProgress(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
    input: UpdateGoalProgressInput,
  ): Promise<GoalResponse> {
    const existing = await this.require(orgId, id);
    await this.assertCanManage(orgId, actor, existing.employeeId);
    const updated = await this.prisma.goal.update({
      where: { id },
      data: {
        ...(input.actual !== undefined ? { actual: input.actual } : {}),
        progress: input.progress,
        // Tự chuyển trạng thái theo tiến độ (giữ DONE/CANCELLED do người dùng đặt).
        ...(existing.status === 'DRAFT' && input.progress > 0
          ? { status: 'ACTIVE' as const }
          : {}),
        ...(input.progress >= 100 && existing.status === 'ACTIVE'
          ? { status: 'DONE' as const }
          : {}),
      },
      include: INCLUDE,
    });
    addAuditMetadata({
      before: { progress: existing.progress },
      after: { progress: input.progress },
    });
    return toResponse(updated);
  }

  async remove(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
  ): Promise<{ id: string }> {
    const existing = await this.require(orgId, id);
    await this.assertCanManage(orgId, actor, existing.employeeId);
    await this.prisma.goal.delete({ where: { id } });
    addAuditMetadata({ before: { title: existing.title } });
    return { id };
  }

  // ===== helpers =====

  private async require(orgId: string, id: string): Promise<GoalRow> {
    const g = await this.prisma.goal.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!g) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy mục tiêu',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return g;
  }

  private async ownEmployeeId(
    orgId: string,
    actor: AccessTokenPayload,
  ): Promise<string> {
    const e = await this.prisma.employee.findFirst({
      where: { userId: actor.sub, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!e) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Tài khoản chưa gắn hồ sơ nhân viên — không thể đặt mục tiêu',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    return e.id;
  }

  /** Điều kiện Employee theo phạm vi của actor (toàn org / subtree + bản thân). */
  private async scopeEmployeeWhere(
    orgId: string,
    actor: AccessTokenPayload,
  ): Promise<Prisma.EmployeeWhereInput> {
    const paths = await this.employees.resolveScopePaths(actor);
    if (paths === null) return { orgId, deletedAt: null };
    return {
      orgId,
      deletedAt: null,
      OR: [
        ...paths.map((p) => ({
          orgUnit: { is: { path: { startsWith: p } } },
        })),
        { userId: actor.sub },
      ],
    };
  }

  /** Chặn thao tác mục tiêu của nhân viên ngoài phạm vi. */
  private async assertCanManage(
    orgId: string,
    actor: AccessTokenPayload,
    employeeId: string,
  ): Promise<void> {
    const where = await this.scopeEmployeeWhere(orgId, actor);
    const found = await this.prisma.employee.findFirst({
      where: { ...where, id: employeeId },
      select: { id: true },
    });
    if (!found) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Không có quyền thao tác mục tiêu của nhân viên này',
        ERROR_CODES.FORBIDDEN,
      );
    }
  }

  private async assertKpiInOrg(orgId: string, kpiId: string): Promise<void> {
    const k = await this.prisma.kpiDefinition.findFirst({
      where: { id: kpiId, orgId },
      select: { id: true },
    });
    if (!k) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'KPI không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
  }

  private async assertParentInOrg(
    orgId: string,
    parentId: string,
  ): Promise<void> {
    const p = await this.prisma.goal.findFirst({
      where: { id: parentId, orgId },
      select: { id: true },
    });
    if (!p) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Mục tiêu cấp trên không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
  }
}
