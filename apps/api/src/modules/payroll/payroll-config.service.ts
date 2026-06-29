import { Injectable } from '@nestjs/common';
import {
  pitBracketSchema,
  VN_PAYROLL_DEFAULTS,
  type PayrollConfigResponse,
  type PitBracketInput,
  type UpdatePayrollConfigInput,
} from '@repo/shared';
import { z } from 'zod';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type ConfigRow = Prisma.PayrollConfigGetPayload<object>;

const bracketsSchema = z.array(pitBracketSchema);

function defaultBrackets(): PitBracketInput[] {
  return VN_PAYROLL_DEFAULTS.pitBrackets.map((b) => ({
    upTo: b.upTo,
    rateBps: b.rateBps,
  }));
}

function parseBrackets(json: Prisma.JsonValue | null): PitBracketInput[] {
  const parsed = bracketsSchema.safeParse(json);
  return parsed.success && parsed.data.length > 0 ? parsed.data : defaultBrackets();
}

function toResponse(c: ConfigRow): PayrollConfigResponse {
  return {
    personalDeduction: c.personalDeduction,
    dependentDeduction: c.dependentDeduction,
    baseSalaryGov: c.baseSalaryGov,
    regionMinWage: c.regionMinWage,
    bhxhRateBps: c.bhxhRateBps,
    bhytRateBps: c.bhytRateBps,
    bhtnRateBps: c.bhtnRateBps,
    pitBrackets: parseBrackets(c.pitBrackets),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Cấu hình lương/thuế/BH — 1 bản/đơn vị, tạo từ mặc định VN nếu chưa có. */
@Injectable()
export class PayrollConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lấy config (tự tạo bản mặc định VN nếu chưa có). */
  async getOrCreate(orgId: string): Promise<ConfigRow> {
    const existing = await this.prisma.payrollConfig.findUnique({
      where: { orgId },
    });
    if (existing) return existing;
    return this.prisma.payrollConfig.create({
      data: {
        orgId,
        personalDeduction: VN_PAYROLL_DEFAULTS.personalDeduction,
        dependentDeduction: VN_PAYROLL_DEFAULTS.dependentDeduction,
        baseSalaryGov: VN_PAYROLL_DEFAULTS.baseSalaryGov,
        regionMinWage: VN_PAYROLL_DEFAULTS.regionMinWage,
        bhxhRateBps: VN_PAYROLL_DEFAULTS.bhxhRateBps,
        bhytRateBps: VN_PAYROLL_DEFAULTS.bhytRateBps,
        bhtnRateBps: VN_PAYROLL_DEFAULTS.bhtnRateBps,
        pitBrackets: defaultBrackets(),
      },
    });
  }

  async get(orgId: string): Promise<PayrollConfigResponse> {
    return toResponse(await this.getOrCreate(orgId));
  }

  /** Cấu hình dạng engine (parse brackets) — cho PayrollEngine. */
  async getEngineConfig(orgId: string): Promise<{
    personalDeduction: number;
    dependentDeduction: number;
    baseSalaryGov: number;
    regionMinWage: number;
    bhxhRateBps: number;
    bhytRateBps: number;
    bhtnRateBps: number;
    pitBrackets: PitBracketInput[];
  }> {
    const c = await this.getOrCreate(orgId);
    return {
      personalDeduction: c.personalDeduction,
      dependentDeduction: c.dependentDeduction,
      baseSalaryGov: c.baseSalaryGov,
      regionMinWage: c.regionMinWage,
      bhxhRateBps: c.bhxhRateBps,
      bhytRateBps: c.bhytRateBps,
      bhtnRateBps: c.bhtnRateBps,
      pitBrackets: parseBrackets(c.pitBrackets),
    };
  }

  async update(
    orgId: string,
    input: UpdatePayrollConfigInput,
  ): Promise<PayrollConfigResponse> {
    await this.getOrCreate(orgId);
    const updated = await this.prisma.payrollConfig.update({
      where: { orgId },
      data: {
        ...(input.personalDeduction !== undefined
          ? { personalDeduction: input.personalDeduction }
          : {}),
        ...(input.dependentDeduction !== undefined
          ? { dependentDeduction: input.dependentDeduction }
          : {}),
        ...(input.baseSalaryGov !== undefined
          ? { baseSalaryGov: input.baseSalaryGov }
          : {}),
        ...(input.regionMinWage !== undefined
          ? { regionMinWage: input.regionMinWage }
          : {}),
        ...(input.bhxhRateBps !== undefined ? { bhxhRateBps: input.bhxhRateBps } : {}),
        ...(input.bhytRateBps !== undefined ? { bhytRateBps: input.bhytRateBps } : {}),
        ...(input.bhtnRateBps !== undefined ? { bhtnRateBps: input.bhtnRateBps } : {}),
        ...(input.pitBrackets !== undefined
          ? { pitBrackets: input.pitBrackets }
          : {}),
      },
    });
    addAuditMetadata({ after: { updated: true } });
    return toResponse(updated);
  }
}
