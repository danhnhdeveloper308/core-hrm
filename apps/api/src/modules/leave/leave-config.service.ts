import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  ERROR_CODES,
  type CreateLeavePolicyInput,
  type CreateLeaveTypeInput,
  type LeavePolicyResponse,
  type LeaveTypeResponse,
  type UpdateLeavePolicyInput,
  type UpdateLeaveTypeInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { LeavePolicy, LeaveType } from '../../prisma/prisma.types';
import { PrismaService } from '../../prisma/prisma.service';
import { accrualMonths, monthlyAccrual, yearlyQuota } from './leave.engine';

function toTypeResponse(t: LeaveType): LeaveTypeResponse {
  return { id: t.id, name: t.name, code: t.code, paid: t.paid, color: t.color };
}

@Injectable()
export class LeaveConfigService {
  private readonly logger = new Logger(LeaveConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ===== LeaveType =====

  async listTypes(orgId: string): Promise<LeaveTypeResponse[]> {
    const types = await this.prisma.leaveType.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
    });
    return types.map(toTypeResponse);
  }

  async createType(orgId: string, input: CreateLeaveTypeInput): Promise<LeaveTypeResponse> {
    const taken = await this.prisma.leaveType.findUnique({
      where: { orgId_code: { orgId, code: input.code } },
    });
    if (taken) {
      throw new AppException(
        HttpStatus.CONFLICT,
        `Code "${input.code}" đã được dùng`,
        ERROR_CODES.ORG_CODE_TAKEN,
      );
    }
    const type = await this.prisma.leaveType.create({ data: { ...input, orgId } });
    addAuditMetadata({ after: { code: type.code, name: type.name } });
    return toTypeResponse(type);
  }

  async updateType(
    orgId: string,
    id: string,
    input: UpdateLeaveTypeInput,
  ): Promise<LeaveTypeResponse> {
    await this.requireType(orgId, id);
    const updated = await this.prisma.leaveType.update({ where: { id }, data: input });
    addAuditMetadata({ after: { id, name: updated.name } });
    return toTypeResponse(updated);
  }

  async removeType(orgId: string, id: string): Promise<{ message: string }> {
    const type = await this.requireType(orgId, id);
    await this.prisma.leaveType.delete({ where: { id } });
    addAuditMetadata({ before: { code: type.code } });
    return { message: `Đã xoá loại phép ${type.name}` };
  }

  // ===== LeavePolicy =====

  async listPolicies(orgId: string): Promise<LeavePolicyResponse[]> {
    const policies = await this.prisma.leavePolicy.findMany({
      where: { orgId },
      include: { leaveType: { select: { name: true } } },
    });
    return policies.map((p) => this.toPolicyResponse(p, p.leaveType.name));
  }

  async createPolicy(
    orgId: string,
    input: CreateLeavePolicyInput,
  ): Promise<LeavePolicyResponse> {
    const existing = await this.prisma.leavePolicy.findFirst({
      where: { orgId, leaveTypeId: input.leaveTypeId, orgUnitId: input.orgUnitId ?? null },
    });
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Đã có chính sách cho loại phép + đơn vị này',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const policy = await this.prisma.leavePolicy.create({
      data: {
        orgId,
        leaveTypeId: input.leaveTypeId,
        orgUnitId: input.orgUnitId ?? null,
        daysPerYear: input.daysPerYear,
        accrualType: input.accrualType,
        prorateFirstYear: input.prorateFirstYear,
        seniorityBonusDays: input.seniorityBonusDays,
        seniorityEveryYears: input.seniorityEveryYears,
        carryOverMaxDays: input.carryOverMaxDays,
        carryOverExpiresOn: input.carryOverExpiresOn ?? null,
        allowNegativeBalance: input.allowNegativeBalance,
      },
      include: { leaveType: { select: { name: true } } },
    });
    addAuditMetadata({ after: { leaveTypeId: input.leaveTypeId } });
    return this.toPolicyResponse(policy, policy.leaveType.name);
  }

  async updatePolicy(
    orgId: string,
    id: string,
    input: UpdateLeavePolicyInput,
  ): Promise<LeavePolicyResponse> {
    await this.requirePolicy(orgId, id);
    const policy = await this.prisma.leavePolicy.update({
      where: { id },
      data: {
        ...(input.daysPerYear !== undefined ? { daysPerYear: input.daysPerYear } : {}),
        ...(input.accrualType !== undefined ? { accrualType: input.accrualType } : {}),
        ...(input.prorateFirstYear !== undefined
          ? { prorateFirstYear: input.prorateFirstYear }
          : {}),
        ...(input.seniorityBonusDays !== undefined
          ? { seniorityBonusDays: input.seniorityBonusDays }
          : {}),
        ...(input.seniorityEveryYears !== undefined
          ? { seniorityEveryYears: input.seniorityEveryYears }
          : {}),
        ...(input.carryOverMaxDays !== undefined
          ? { carryOverMaxDays: input.carryOverMaxDays }
          : {}),
        ...(input.carryOverExpiresOn !== undefined
          ? { carryOverExpiresOn: input.carryOverExpiresOn ?? null }
          : {}),
        ...(input.allowNegativeBalance !== undefined
          ? { allowNegativeBalance: input.allowNegativeBalance }
          : {}),
      },
      include: { leaveType: { select: { name: true } } },
    });
    addAuditMetadata({ after: { id } });
    return this.toPolicyResponse(policy, policy.leaveType.name);
  }

  async removePolicy(orgId: string, id: string): Promise<{ message: string }> {
    await this.requirePolicy(orgId, id);
    await this.prisma.leavePolicy.delete({ where: { id } });
    addAuditMetadata({ before: { id } });
    return { message: 'Đã xoá chính sách phép' };
  }

  // ===== Cron cấp phép (idempotent) =====

  /** 02:00 mùng 1 hàng tháng: cấp phép cho toàn bộ nhân viên active. */
  @Cron('0 2 1 * *')
  async runAccrual(): Promise<void> {
    const year = new Date().getUTCFullYear();
    const month = new Date().getUTCMonth() + 1;
    const orgs = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    for (const org of orgs) {
      try {
        await this.accrueOrg(org.id, year, month);
      } catch (err) {
        this.logger.error(`Accrual org ${org.id} lỗi: ${(err as Error).message}`);
      }
    }
    this.logger.log(`Hoàn tất cấp phép tháng ${month}/${year}`);
  }

  /**
   * Cấp phép cho 1 org. YEARLY_UPFRONT: chỉ cấp ở tháng 1 (hoặc tháng vào việc);
   * MONTHLY: cấp mỗi tháng. Idempotent qua unique (employee, type, period).
   */
  async accrueOrg(orgId: string, year: number, month: number): Promise<number> {
    const policies = await this.prisma.leavePolicy.findMany({
      where: { orgId, orgUnitId: null },
    });
    if (policies.length === 0) return 0;
    const employees = await this.prisma.employee.findMany({
      where: { orgId, status: { in: ['ACTIVE', 'PROBATION'] } },
      select: { id: true, joinDate: true },
    });

    let created = 0;
    for (const policy of policies) {
      const info = {
        daysPerYear: Number(policy.daysPerYear),
        accrualType: policy.accrualType,
        prorateFirstYear: policy.prorateFirstYear,
        seniorityBonusDays: policy.seniorityBonusDays,
        seniorityEveryYears: policy.seniorityEveryYears,
      };
      for (const emp of employees) {
        const months = accrualMonths(emp.joinDate, year);
        if (policy.accrualType === 'YEARLY_UPFRONT') {
          // cấp trọn năm ở tháng bắt đầu (tháng 1 hoặc tháng vào việc)
          if (month !== months[0]) continue;
          created += await this.upsertAccrual(
            orgId,
            emp.id,
            policy.leaveTypeId,
            year,
            `${year}`,
            yearlyQuota(info, emp.joinDate, year),
            `Cấp phép năm ${year}`,
          );
        } else {
          if (!months.includes(month)) continue;
          created += await this.upsertAccrual(
            orgId,
            emp.id,
            policy.leaveTypeId,
            year,
            `${year}-${String(month).padStart(2, '0')}`,
            monthlyAccrual(info, emp.joinDate, year),
            `Cấp phép tháng ${month}/${year}`,
          );
        }
      }
    }
    return created;
  }

  private async upsertAccrual(
    orgId: string,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    period: string,
    amount: number,
    reason: string,
  ): Promise<number> {
    const exists = await this.prisma.leaveBalanceEntry.findFirst({
      where: { employeeId, leaveTypeId, type: 'ACCRUAL', period },
    });
    if (exists) return 0;
    await this.prisma.leaveBalanceEntry.create({
      data: { orgId, employeeId, leaveTypeId, year, amount, type: 'ACCRUAL', period, reason },
    });
    return 1;
  }

  private toPolicyResponse(p: LeavePolicy, leaveTypeName: string): LeavePolicyResponse {
    return {
      id: p.id,
      leaveTypeId: p.leaveTypeId,
      leaveTypeName,
      orgUnitId: p.orgUnitId,
      daysPerYear: Number(p.daysPerYear),
      accrualType: p.accrualType,
      prorateFirstYear: p.prorateFirstYear,
      seniorityBonusDays: p.seniorityBonusDays,
      seniorityEveryYears: p.seniorityEveryYears,
      carryOverMaxDays: Number(p.carryOverMaxDays),
      carryOverExpiresOn: p.carryOverExpiresOn,
      allowNegativeBalance: p.allowNegativeBalance,
    };
  }

  private async requireType(orgId: string, id: string) {
    const type = await this.prisma.leaveType.findFirst({ where: { id, orgId } });
    if (!type) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Không tìm thấy loại phép', ERROR_CODES.NOT_FOUND);
    }
    return type;
  }

  private async requirePolicy(orgId: string, id: string) {
    const policy = await this.prisma.leavePolicy.findFirst({ where: { id, orgId } });
    if (!policy) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Không tìm thấy chính sách', ERROR_CODES.NOT_FOUND);
    }
    return policy;
  }
}
