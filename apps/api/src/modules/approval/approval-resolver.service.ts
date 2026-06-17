import { Injectable } from '@nestjs/common';
import type { ApproverType } from '@repo/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface ResolvedApprover {
  userIds: string[];
  names: string[];
}

export interface FlowStepLike {
  approverType: ApproverType;
  chainLevel: number | null;
  unitTypeCode: string | null;
  orgUnitId: string | null;
  roleId: string | null;
  userId: string | null;
}

interface RequesterCtx {
  employeeId: string;
  userId: string | null;
  orgId: string;
}

/**
 * Resolve động danh sách user được duyệt cho từng bước, theo VỊ TRÍ của người
 * tạo đơn trên cây tổ chức (spec 2.8). Mỗi bước trả ≥0 user — bất kỳ ai trong
 * danh sách duyệt là qua bước (OR). Rỗng hoặc ra chính requester → auto-skip.
 */
@Injectable()
export class ApprovalResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveStep(
    step: FlowStepLike,
    requester: RequesterCtx,
  ): Promise<ResolvedApprover> {
    switch (step.approverType) {
      case 'DIRECT_MANAGER':
        return this.byManagerChain(requester.employeeId, 1);
      case 'MANAGEMENT_CHAIN':
        return this.byManagerChain(requester.employeeId, step.chainLevel ?? 1);
      case 'UNIT_MANAGER_OF_TYPE':
        return this.byUnitManagerOfType(requester, step.unitTypeCode, step.chainLevel ?? 1);
      case 'UNIT_MANAGER_OF_UNIT':
        return this.byUnitManagerOfUnit(requester.orgId, step.orgUnitId, step.chainLevel ?? 1);
      case 'ROLE':
        return this.byRole(requester.orgId, step.roleId);
      case 'SPECIFIC_USER':
        return this.byUser(step.userId);
      default:
        return { userIds: [], names: [] };
    }
  }

  /** Leo Employee.managerId n cấp. */
  private async byManagerChain(
    employeeId: string,
    levels: number,
  ): Promise<ResolvedApprover> {
    let currentId: string | null = employeeId;
    let target: { userId: string | null; fullName: string } | null = null;
    for (let i = 0; i < levels && currentId !== null; i++) {
      const lookupId: string = currentId;
      const emp = await this.prisma.employee.findUnique({
        where: { id: lookupId },
        select: { managerId: true, manager: { select: { userId: true, fullName: true } } },
      });
      if (!emp?.managerId || !emp.manager) break;
      target = emp.manager;
      currentId = emp.managerId;
    }
    return this.toResult(target);
  }

  /**
   * Manager của OrgUnit tổ tiên GẦN NHẤT có loại = unitTypeCode (vd NHA_MAY →
   * Giám đốc nhà máy). Leo materialized path từ unit của requester lên gốc.
   */
  private async byUnitManagerOfType(
    requester: RequesterCtx,
    unitTypeCode: string | null,
    chainLevel: number,
  ): Promise<ResolvedApprover> {
    if (!unitTypeCode) return { userIds: [], names: [] };
    const employee = await this.prisma.employee.findUnique({
      where: { id: requester.employeeId },
      select: { orgUnit: { select: { path: true } } },
    });
    if (!employee?.orgUnit) return { userIds: [], names: [] };

    const ids = employee.orgUnit.path.split('/').filter(Boolean);
    const units = await this.prisma.orgUnit.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: { select: { code: true } }, managerId: true },
    });
    const byId = new Map(units.map((u) => [u.id, u]));
    // Leo từ gần (cuối path) lên xa (gốc), lấy unit đầu tiên đúng loại
    for (let i = ids.length - 1; i >= 0; i--) {
      const unit = byId.get(ids[i]!);
      if (unit?.type.code === unitTypeCode) {
        if (!unit.managerId) return { userIds: [], names: [] };
        return this.toResult(await this.climbManager(unit.managerId, chainLevel - 1));
      }
    }
    return { userIds: [], names: [] };
  }

  /**
   * Quản lý của ĐÚNG 1 đơn vị được chọn (không leo cây tổ chức). chainLevel:
   * 1 = chính quản lý đơn vị; 2 = quản lý cấp trên của họ; …
   */
  private async byUnitManagerOfUnit(
    orgId: string,
    orgUnitId: string | null,
    chainLevel: number,
  ): Promise<ResolvedApprover> {
    if (!orgUnitId) return { userIds: [], names: [] };
    const unit = await this.prisma.orgUnit.findFirst({
      where: { id: orgUnitId, orgId },
      select: { managerId: true },
    });
    if (!unit?.managerId) return { userIds: [], names: [] };
    return this.toResult(await this.climbManager(unit.managerId, chainLevel - 1));
  }

  /** Từ 1 nhân viên, leo thêm `extra` cấp quản lý (0 = chính nhân viên đó). */
  private async climbManager(
    employeeId: string,
    extra: number,
  ): Promise<{ userId: string | null; fullName: string } | null> {
    let current: { userId: string | null; fullName: string; managerId: string | null } | null =
      await this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { userId: true, fullName: true, managerId: true },
      });
    for (let i = 0; i < extra && current?.managerId; i++) {
      current = await this.prisma.employee.findUnique({
        where: { id: current.managerId },
        select: { userId: true, fullName: true, managerId: true },
      });
    }
    return current ? { userId: current.userId, fullName: current.fullName } : null;
  }

  /** Mọi user ACTIVE trong org có role đó. */
  private async byRole(
    orgId: string,
    roleId: string | null,
  ): Promise<ResolvedApprover> {
    if (!roleId) return { userIds: [], names: [] };
    const users = await this.prisma.user.findMany({
      where: { orgId, status: 'ACTIVE', roles: { some: { roleId } } },
      select: { id: true, name: true },
    });
    return { userIds: users.map((u) => u.id), names: users.map((u) => u.name) };
  }

  private async byUser(userId: string | null): Promise<ResolvedApprover> {
    if (!userId) return { userIds: [], names: [] };
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    return user ? { userIds: [user.id], names: [user.name] } : { userIds: [], names: [] };
  }

  private toResult(
    target: { userId: string | null; fullName: string } | null,
  ): ResolvedApprover {
    if (!target?.userId) return { userIds: [], names: [] };
    return { userIds: [target.userId], names: [target.fullName] };
  }
}
