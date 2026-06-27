import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  VN_OT_DEFAULTS,
  type CreateOtPolicyInput,
  type OtPolicyResponse,
  type OvertimeSummary,
  type OvertimeSummaryQuery,
  type UpdateOtPolicyInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeesService } from '../employees/employees.service';

type OtPolicyWithUnit = Prisma.OtPolicyGetPayload<{
  include: { orgUnit: { select: { name: true } } };
}>;

function toPolicyResponse(p: OtPolicyWithUnit): OtPolicyResponse {
  return {
    id: p.id,
    orgUnitId: p.orgUnitId,
    orgUnitName: p.orgUnit?.name ?? null,
    maxHoursPerMonth: p.maxHoursPerMonth,
    maxHoursPerYear: p.maxHoursPerYear,
  };
}

function hours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

/**
 * Quản trị tăng ca (OT): cấu hình trần OT (OtPolicy) + tổng hợp giờ OT theo
 * tháng/đơn vị + cảnh báo vượt trần. Nguồn giờ OT = `TimesheetDay.otMinutes`
 * (mọi luồng OT — đơn cá nhân, phiếu tăng/giãn ca — đều đổ vào đây).
 */
@Injectable()
export class OvertimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
  ) {}

  // ===== OtPolicy CRUD =====

  async listPolicies(orgId: string): Promise<OtPolicyResponse[]> {
    const policies = await this.prisma.otPolicy.findMany({
      where: { orgId },
      include: { orgUnit: { select: { name: true } } },
      orderBy: [{ orgUnitId: 'asc' }],
    });
    return policies.map(toPolicyResponse);
  }

  async createPolicy(
    orgId: string,
    input: CreateOtPolicyInput,
  ): Promise<OtPolicyResponse> {
    const orgUnitId = input.orgUnitId ?? null;
    if (orgUnitId) await this.requireUnit(orgId, orgUnitId);
    // Unique (orgId, orgUnitId): Postgres cho phép nhiều NULL → guard tay cho trần org.
    const existing = await this.prisma.otPolicy.findFirst({
      where: { orgId, orgUnitId },
    });
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        orgUnitId
          ? 'Đơn vị này đã có trần OT'
          : 'Đã có trần OT mặc định toàn tổ chức',
        ERROR_CODES.ORG_CODE_TAKEN,
      );
    }
    const policy = await this.prisma.otPolicy.create({
      data: {
        orgId,
        orgUnitId,
        maxHoursPerMonth: input.maxHoursPerMonth,
        maxHoursPerYear: input.maxHoursPerYear,
      },
      include: { orgUnit: { select: { name: true } } },
    });
    addAuditMetadata({
      after: {
        orgUnitId,
        maxHoursPerMonth: policy.maxHoursPerMonth,
        maxHoursPerYear: policy.maxHoursPerYear,
      },
    });
    return toPolicyResponse(policy);
  }

  async updatePolicy(
    orgId: string,
    id: string,
    input: UpdateOtPolicyInput,
  ): Promise<OtPolicyResponse> {
    const policy = await this.requirePolicy(orgId, id);
    const updated = await this.prisma.otPolicy.update({
      where: { id },
      data: {
        ...(input.maxHoursPerMonth !== undefined
          ? { maxHoursPerMonth: input.maxHoursPerMonth }
          : {}),
        ...(input.maxHoursPerYear !== undefined
          ? { maxHoursPerYear: input.maxHoursPerYear }
          : {}),
      },
      include: { orgUnit: { select: { name: true } } },
    });
    addAuditMetadata({
      before: {
        maxHoursPerMonth: policy.maxHoursPerMonth,
        maxHoursPerYear: policy.maxHoursPerYear,
      },
      after: {
        maxHoursPerMonth: updated.maxHoursPerMonth,
        maxHoursPerYear: updated.maxHoursPerYear,
      },
    });
    return toPolicyResponse(updated);
  }

  async removePolicy(orgId: string, id: string): Promise<{ message: string }> {
    const policy = await this.requirePolicy(orgId, id);
    await this.prisma.otPolicy.delete({ where: { id } });
    addAuditMetadata({ before: { orgUnitId: policy.orgUnitId } });
    return { message: 'Đã xoá trần OT' };
  }

  // ===== Tổng hợp OT theo tháng =====

  async summary(
    orgId: string,
    actor: AccessTokenPayload,
    query: OvertimeSummaryQuery,
  ): Promise<OvertimeSummary> {
    const [y, m] = query.month.split('-').map(Number) as [number, number];
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    const monthEnd = new Date(Date.UTC(y, m, 0));
    const yearStart = new Date(Date.UTC(y, 0, 1));

    const scopePaths = await this.employees.resolveScopePaths(actor);
    let unitPath: string | null = null;
    if (query.orgUnitId) {
      const unit = await this.prisma.orgUnit.findFirst({
        where: { id: query.orgUnitId, orgId },
        select: { path: true },
      });
      unitPath = unit?.path ?? null;
    }

    const and: Prisma.EmployeeWhereInput[] = [];
    if (unitPath) {
      and.push({ orgUnit: { is: { path: { startsWith: unitPath } } } });
    }
    if (scopePaths) {
      and.push({
        OR: [
          ...scopePaths.map((p) => ({
            orgUnit: { is: { path: { startsWith: p } } },
          })),
          { userId: actor.sub },
        ],
      });
    }
    const employeeWhere: Prisma.EmployeeWhereInput = {
      orgId,
      deletedAt: null,
      status: { not: 'TERMINATED' },
      ...(and.length ? { AND: and } : {}),
    };

    const [monthAgg, yearAgg] = await Promise.all([
      this.prisma.timesheetDay.groupBy({
        by: ['employeeId'],
        where: {
          orgId,
          date: { gte: monthStart, lte: monthEnd },
          otMinutes: { gt: 0 },
          employee: { is: employeeWhere },
        },
        _sum: { otMinutes: true },
      }),
      this.prisma.timesheetDay.groupBy({
        by: ['employeeId'],
        where: {
          orgId,
          date: { gte: yearStart, lte: monthEnd },
          otMinutes: { gt: 0 },
          employee: { is: employeeWhere },
        },
        _sum: { otMinutes: true },
      }),
    ]);

    const monthMap = new Map(
      monthAgg.map((r) => [r.employeeId, r._sum.otMinutes ?? 0]),
    );
    const yearMap = new Map(
      yearAgg.map((r) => [r.employeeId, r._sum.otMinutes ?? 0]),
    );
    const caps = await this.resolveCaps(orgId);

    const empIds = [...new Set([...monthMap.keys(), ...yearMap.keys()])];
    if (empIds.length === 0) {
      return {
        month: query.month,
        caps: caps.orgDefault,
        rows: [],
        byUnit: [],
        totals: { monthHours: 0, employees: 0, overMonth: 0, overYear: 0 },
      };
    }

    const emps = await this.prisma.employee.findMany({
      where: { id: { in: empIds } },
      select: {
        id: true,
        code: true,
        fullName: true,
        orgUnitId: true,
        orgUnit: { select: { name: true, path: true } },
      },
    });

    const rows = emps
      .map((e) => {
        const cap = caps.forPath(e.orgUnit?.path ?? null);
        const monthHours = hours(monthMap.get(e.id) ?? 0);
        const yearHours = hours(yearMap.get(e.id) ?? 0);
        return {
          employeeId: e.id,
          employeeCode: e.code,
          employeeName: e.fullName,
          orgUnitId: e.orgUnitId,
          orgUnitName: e.orgUnit?.name ?? null,
          monthHours,
          yearHours,
          maxHoursPerMonth: cap.maxHoursPerMonth,
          maxHoursPerYear: cap.maxHoursPerYear,
          overMonth: monthHours > cap.maxHoursPerMonth,
          overYear: yearHours > cap.maxHoursPerYear,
        };
      })
      .sort((a, b) => b.monthHours - a.monthHours);

    // ----- byUnit (theo tháng) + totals -----
    const unitAgg = new Map<
      string,
      {
        orgUnitId: string | null;
        orgUnitName: string;
        monthHours: number;
        employees: number;
        overCount: number;
      }
    >();
    let totalMonthHours = 0;
    let totalEmployees = 0;
    let overMonth = 0;
    let overYear = 0;
    for (const r of rows) {
      if (r.overYear) overYear++;
      if (r.monthHours <= 0) continue;
      totalMonthHours += r.monthHours;
      totalEmployees++;
      if (r.overMonth) overMonth++;
      const key = r.orgUnitId ?? '__none__';
      const agg =
        unitAgg.get(key) ??
        {
          orgUnitId: r.orgUnitId,
          orgUnitName: r.orgUnitName ?? 'Chưa gán đơn vị',
          monthHours: 0,
          employees: 0,
          overCount: 0,
        };
      agg.monthHours = Math.round((agg.monthHours + r.monthHours) * 10) / 10;
      agg.employees++;
      if (r.overMonth) agg.overCount++;
      unitAgg.set(key, agg);
    }

    const byUnit = [...unitAgg.values()]
      .sort((a, b) => b.monthHours - a.monthHours)
      .slice(0, 12);

    return {
      month: query.month,
      caps: caps.orgDefault,
      rows,
      byUnit,
      totals: {
        monthHours: Math.round(totalMonthHours * 10) / 10,
        employees: totalEmployees,
        overMonth,
        overYear,
      },
    };
  }

  /** Trần OT theo org default + override theo đơn vị (resolve theo path, gần nhất thắng). */
  private async resolveCaps(orgId: string): Promise<{
    orgDefault: { maxHoursPerMonth: number; maxHoursPerYear: number };
    forPath: (path: string | null) => {
      maxHoursPerMonth: number;
      maxHoursPerYear: number;
    };
  }> {
    const policies = await this.prisma.otPolicy.findMany({
      where: { orgId },
      include: { orgUnit: { select: { path: true } } },
    });
    const orgPolicy = policies.find((p) => p.orgUnitId === null);
    const orgDefault = orgPolicy
      ? {
          maxHoursPerMonth: orgPolicy.maxHoursPerMonth,
          maxHoursPerYear: orgPolicy.maxHoursPerYear,
        }
      : { ...VN_OT_DEFAULTS };
    // Đơn vị sâu nhất trước → ancestor gần nhất thắng.
    const unitPolicies = policies
      .filter((p) => p.orgUnitId !== null && p.orgUnit)
      .map((p) => ({
        path: p.orgUnit!.path,
        maxHoursPerMonth: p.maxHoursPerMonth,
        maxHoursPerYear: p.maxHoursPerYear,
      }))
      .sort((a, b) => b.path.length - a.path.length);

    return {
      orgDefault,
      forPath: (path) => {
        if (path) {
          const match = unitPolicies.find((up) => path.startsWith(up.path));
          if (match) {
            return {
              maxHoursPerMonth: match.maxHoursPerMonth,
              maxHoursPerYear: match.maxHoursPerYear,
            };
          }
        }
        return orgDefault;
      },
    };
  }

  // ===== helpers =====

  private async requireUnit(orgId: string, id: string) {
    const unit = await this.prisma.orgUnit.findFirst({ where: { id, orgId } });
    if (!unit) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy đơn vị',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return unit;
  }

  private async requirePolicy(orgId: string, id: string) {
    const policy = await this.prisma.otPolicy.findFirst({
      where: { id, orgId },
    });
    if (!policy) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy trần OT',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return policy;
  }
}
