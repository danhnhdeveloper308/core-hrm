import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type ApprovalFlowResponse,
  type ApprovalTargetType,
  type CreateApprovalFlowInput,
  type UpdateApprovalFlowInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type FlowWithSteps = Prisma.ApprovalFlowGetPayload<{
  include: { steps: true };
}>;

@Injectable()
export class ApprovalFlowService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    orgId: string,
    targetType?: ApprovalTargetType,
  ): Promise<ApprovalFlowResponse[]> {
    const flows = await this.prisma.approvalFlow.findMany({
      where: { orgId, ...(targetType ? { targetType } : {}) },
      include: { steps: { orderBy: { order: 'asc' } } },
      orderBy: [{ targetType: 'asc' }, { priority: 'desc' }],
    });
    return Promise.all(flows.map((f) => this.toResponse(f)));
  }

  async create(
    orgId: string,
    input: CreateApprovalFlowInput,
  ): Promise<ApprovalFlowResponse> {
    await this.validateSteps(orgId, input.steps);
    const flow = await this.prisma.approvalFlow.create({
      data: {
        orgId,
        targetType: input.targetType,
        name: input.name,
        priority: input.priority,
        conditions: (input.conditions ?? undefined) as Prisma.InputJsonValue,
        active: input.active,
        steps: {
          create: input.steps.map((s, i) => ({
            order: i + 1,
            approverType: s.approverType,
            chainLevel: s.chainLevel ?? null,
            unitTypeCode: s.unitTypeCode ?? null,
            orgUnitId: s.orgUnitId ?? null,
            roleId: s.roleId ?? null,
            userId: s.userId ?? null,
            slaHours: s.slaHours ?? null,
            label: s.label ?? null,
          })),
        },
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    addAuditMetadata({ after: { name: flow.name, targetType: flow.targetType } });
    return this.toResponse(flow);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateApprovalFlowInput,
  ): Promise<ApprovalFlowResponse> {
    await this.requireFlow(orgId, id);
    if (input.steps) await this.validateSteps(orgId, input.steps);

    const flow = await this.prisma.$transaction(async (tx) => {
      await tx.approvalFlow.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.conditions !== undefined
            ? { conditions: (input.conditions ?? undefined) as Prisma.InputJsonValue }
            : {}),
        },
      });
      // Steps: thay toàn bộ nếu truyền
      if (input.steps) {
        await tx.approvalFlowStep.deleteMany({ where: { flowId: id } });
        await tx.approvalFlowStep.createMany({
          data: input.steps.map((s, i) => ({
            flowId: id,
            order: i + 1,
            approverType: s.approverType,
            chainLevel: s.chainLevel ?? null,
            unitTypeCode: s.unitTypeCode ?? null,
            orgUnitId: s.orgUnitId ?? null,
            roleId: s.roleId ?? null,
            userId: s.userId ?? null,
            slaHours: s.slaHours ?? null,
            label: s.label ?? null,
          })),
        });
      }
      return tx.approvalFlow.findUniqueOrThrow({
        where: { id },
        include: { steps: { orderBy: { order: 'asc' } } },
      });
    });
    addAuditMetadata({ after: { id, name: flow.name } });
    return this.toResponse(flow);
  }

  async remove(orgId: string, id: string): Promise<{ message: string }> {
    const flow = await this.requireFlow(orgId, id);
    await this.prisma.approvalFlow.delete({ where: { id } });
    addAuditMetadata({ before: { name: flow.name } });
    return { message: `Đã xoá luồng duyệt ${flow.name}` };
  }

  /** roleId/userId trong step phải thuộc org. */
  private async validateSteps(
    orgId: string,
    steps: CreateApprovalFlowInput['steps'],
  ): Promise<void> {
    const roleIds = steps.map((s) => s.roleId).filter((v): v is string => !!v);
    const userIds = steps.map((s) => s.userId).filter((v): v is string => !!v);
    const unitIds = steps.map((s) => s.orgUnitId).filter((v): v is string => !!v);
    if (unitIds.length) {
      const found = await this.prisma.orgUnit.count({
        where: { id: { in: unitIds }, orgId },
      });
      if (found !== new Set(unitIds).size) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Đơn vị trong bước duyệt không thuộc tổ chức',
          ERROR_CODES.NOT_FOUND,
        );
      }
    }
    if (roleIds.length) {
      const found = await this.prisma.role.count({
        where: { id: { in: roleIds }, orgId },
      });
      if (found !== new Set(roleIds).size) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Role trong bước duyệt không thuộc tổ chức',
          ERROR_CODES.NOT_FOUND,
        );
      }
    }
    if (userIds.length) {
      const found = await this.prisma.user.count({
        where: { id: { in: userIds }, orgId },
      });
      if (found !== new Set(userIds).size) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Người duyệt chỉ định không thuộc tổ chức',
          ERROR_CODES.NOT_FOUND,
        );
      }
    }
  }

  private async requireFlow(orgId: string, id: string) {
    const flow = await this.prisma.approvalFlow.findFirst({ where: { id, orgId } });
    if (!flow) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy luồng duyệt',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return flow;
  }

  private async toResponse(flow: FlowWithSteps): Promise<ApprovalFlowResponse> {
    const roleIds = flow.steps.map((s) => s.roleId).filter((v): v is string => !!v);
    const userIds = flow.steps.map((s) => s.userId).filter((v): v is string => !!v);
    const unitIds = flow.steps.map((s) => s.orgUnitId).filter((v): v is string => !!v);
    const [roles, users, units] = await Promise.all([
      roleIds.length
        ? this.prisma.role.findMany({
            where: { id: { in: roleIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      unitIds.length
        ? this.prisma.orgUnit.findMany({
            where: { id: { in: unitIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    const userName = new Map(users.map((u) => [u.id, u.name]));
    const unitName = new Map(units.map((u) => [u.id, u.name]));
    return {
      id: flow.id,
      targetType: flow.targetType,
      name: flow.name,
      priority: flow.priority,
      conditions: (flow.conditions as Record<string, unknown> | null) ?? null,
      active: flow.active,
      steps: flow.steps.map((s) => ({
        id: s.id,
        order: s.order,
        approverType: s.approverType,
        chainLevel: s.chainLevel,
        unitTypeCode: s.unitTypeCode,
        orgUnitId: s.orgUnitId,
        orgUnitName: s.orgUnitId ? (unitName.get(s.orgUnitId) ?? null) : null,
        roleId: s.roleId,
        roleName: s.roleId ? (roleName.get(s.roleId) ?? null) : null,
        userId: s.userId,
        userName: s.userId ? (userName.get(s.userId) ?? null) : null,
        slaHours: s.slaHours,
        label: s.label,
      })),
    };
  }
}
