import { Injectable, Logger } from '@nestjs/common';
import { salaryLineSchema, type SalaryLine } from '@repo/shared';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollConfigService } from './payroll-config.service';
import {
  PayrollEngineService,
  type EngineBenefit,
} from './payroll-engine.service';

const linesSchema = z.array(salaryLineSchema);

function parseComponents(json: Prisma.JsonValue | null): SalaryLine[] {
  const parsed = linesSchema.safeParse(json);
  return parsed.success ? parsed.data : [];
}

/** Khoảng ngày [đầu, cuối] của tháng "YYYY-MM" (UTC). */
function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, 1));
  const end = new Date(Date.UTC(y!, m!, 0, 23, 59, 59, 999));
  return { start, end };
}

/**
 * Orchestrator tính lương 1 kỳ: gom dữ liệu (lương versioned, phúc lợi, người
 * phụ thuộc, công/OT) → engine → ghi payslip. Idempotent: xoá payslip cũ rồi
 * tính lại (chỉ khi kỳ còn DRAFT/CALCULATED).
 */
@Injectable()
export class PayrollCalcService {
  private readonly logger = new Logger(PayrollCalcService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PayrollConfigService,
    private readonly engine: PayrollEngineService,
  ) {}

  async calculateRun(orgId: string, runId: string): Promise<void> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, orgId },
      select: { id: true, month: true, status: true },
    });
    if (!run) {
      this.logger.warn(`Kỳ lương ${runId} không tồn tại — bỏ qua`);
      return;
    }
    if (run.status !== 'DRAFT' && run.status !== 'CALCULATED') {
      this.logger.warn(`Kỳ ${run.month} đã chốt (${run.status}) — không tính lại`);
      return;
    }

    const { start, end } = monthRange(run.month);
    const engineConfig = await this.config.getEngineConfig(orgId);

    const employees = await this.prisma.employee.findMany({
      where: { orgId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    if (employees.length === 0) {
      await this.finish(runId, []);
      return;
    }
    const empIds = employees.map((e) => e.id);

    // Lương versioned: bản hiệu lực gần nhất ≤ cuối kỳ cho mỗi NV.
    const salaries = await this.prisma.employeeSalary.findMany({
      where: { orgId, employeeId: { in: empIds }, effectiveDate: { lte: end } },
      orderBy: [{ employeeId: 'asc' }, { effectiveDate: 'desc' }],
    });
    const salaryByEmp = new Map<string, (typeof salaries)[number]>();
    for (const s of salaries) {
      if (!salaryByEmp.has(s.employeeId)) salaryByEmp.set(s.employeeId, s);
    }

    // Phúc lợi hiệu lực trong kỳ.
    const benefits = await this.prisma.employeeBenefit.findMany({
      where: {
        orgId,
        employeeId: { in: empIds },
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: end } }] },
          { OR: [{ endDate: null }, { endDate: { gte: start } }] },
        ],
      },
      include: { benefitPlan: { select: { name: true, amount: true, taxable: true } } },
    });
    const benefitsByEmp = new Map<string, EngineBenefit[]>();
    for (const b of benefits) {
      const list = benefitsByEmp.get(b.employeeId) ?? [];
      list.push({
        name: b.benefitPlan.name,
        amount: b.amount ?? b.benefitPlan.amount,
        taxable: b.benefitPlan.taxable,
      });
      benefitsByEmp.set(b.employeeId, list);
    }

    // Người phụ thuộc (giảm trừ gia cảnh).
    const deps = await this.prisma.dependent.groupBy({
      by: ['employeeId'],
      where: { employeeId: { in: empIds } },
      _count: { _all: true },
    });
    const depByEmp = new Map(deps.map((d) => [d.employeeId, d._count._all]));

    // Công thực tế + OT từ timesheet trong kỳ.
    const days = await this.prisma.timesheetDay.findMany({
      where: { orgId, employeeId: { in: empIds }, date: { gte: start, lte: end } },
      select: { employeeId: true, workMinutes: true, otMinutes: true },
    });
    const workByEmp = new Map<string, { workdays: number; otMinutes: number }>();
    for (const d of days) {
      const cur = workByEmp.get(d.employeeId) ?? { workdays: 0, otMinutes: 0 };
      if (d.workMinutes > 0) cur.workdays += 1;
      cur.otMinutes += d.otMinutes;
      workByEmp.set(d.employeeId, cur);
    }

    const payslips: Prisma.PayslipCreateManyInput[] = [];
    for (const emp of employees) {
      const salary = salaryByEmp.get(emp.id);
      if (!salary) continue; // chưa lập lương → bỏ qua
      const work = workByEmp.get(emp.id) ?? { workdays: 0, otMinutes: 0 };
      const result = this.engine.compute(engineConfig, {
        baseSalary: salary.baseSalary,
        insuranceSalary: salary.insuranceSalary,
        components: parseComponents(salary.componentsJson),
        benefits: benefitsByEmp.get(emp.id) ?? [],
        dependents: depByEmp.get(emp.id) ?? 0,
        workdays: work.workdays,
        otMinutes: work.otMinutes,
      });
      payslips.push({
        orgId,
        runId,
        employeeId: emp.id,
        workdays: result.workdays,
        otMinutes: result.otMinutes,
        baseSalary: result.baseSalary,
        grossEarnings: result.grossEarnings,
        taxableIncome: result.taxableIncome,
        insuranceBase: result.insuranceBase,
        bhxh: result.bhxh,
        bhyt: result.bhyt,
        bhtn: result.bhtn,
        insuranceTotal: result.insuranceTotal,
        pit: result.pit,
        otherDeductions: result.otherDeductions,
        netPay: result.netPay,
        breakdownJson: result.breakdown as unknown as Prisma.InputJsonValue,
      });
    }

    await this.finish(runId, payslips);
    this.logger.log(`Tính lương kỳ ${run.month}: ${payslips.length} phiếu`);
  }

  /** Xoá payslip cũ + ghi mới + chốt CALCULATED trong 1 transaction. */
  private async finish(
    runId: string,
    payslips: Prisma.PayslipCreateManyInput[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.payslip.deleteMany({ where: { runId } }),
      ...(payslips.length > 0
        ? [this.prisma.payslip.createMany({ data: payslips })]
        : []),
      this.prisma.payrollRun.update({
        where: { id: runId },
        data: { status: 'CALCULATED', runAt: new Date() },
      }),
    ]);
  }
}
