import { Injectable } from '@nestjs/common';
import type {
  PayslipBreakdownLine,
  PitBracketInput,
  SalaryLine,
} from '@repo/shared';

/** Tham số cấu hình tính lương (từ PayrollConfig). */
export interface EngineConfig {
  personalDeduction: number;
  dependentDeduction: number;
  baseSalaryGov: number;
  regionMinWage: number;
  bhxhRateBps: number;
  bhytRateBps: number;
  bhtnRateBps: number;
  pitBrackets: PitBracketInput[];
}

export interface EngineBenefit {
  name: string;
  amount: number;
  taxable: boolean;
}

/** Đầu vào tính lương 1 NV cho 1 kỳ. */
export interface PayrollInput {
  baseSalary: number;
  /** Lương đóng BH (null = dùng baseSalary). */
  insuranceSalary: number | null;
  components: SalaryLine[];
  benefits: EngineBenefit[];
  dependents: number;
  workdays: number;
  otMinutes: number;
}

export interface PayslipResult {
  workdays: number;
  otMinutes: number;
  baseSalary: number;
  grossEarnings: number;
  taxableIncome: number;
  insuranceBase: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  insuranceTotal: number;
  pit: number;
  otherDeductions: number;
  netPay: number;
  breakdown: PayslipBreakdownLine[];
}

/** Số ngày/giờ công chuẩn dùng quy đổi đơn giá giờ cho OT. */
const STD_WORKDAYS = 26;
const STD_HOURS_PER_DAY = 8;
/** Hệ số OT mặc định (150%). OT phức tạp theo loại ngày — v1 dùng 1 hệ số. */
const OT_MULTIPLIER = 1.5;

const round = (n: number): number => Math.round(n);

/**
 * Thuế TNCN luỹ tiến từng phần. `income` = thu nhập tính thuế (đã trừ giảm trừ
 * & BH). `brackets` sắp tăng dần theo `upTo` (bậc cuối upTo=null).
 */
export function progressivePit(
  income: number,
  brackets: PitBracketInput[],
): number {
  if (income <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo ?? Number.POSITIVE_INFINITY;
    if (income > lower) {
      const slice = Math.min(income, upper) - lower;
      tax += (slice * b.rateBps) / 10_000;
    }
    lower = upper;
    if (income <= upper) break;
  }
  return round(tax);
}

/**
 * Engine tính lương VN — thuần tuý (không I/O), dễ test. Quy ước:
 * - Lương cơ bản tính NGUYÊN tháng (chưa prorate theo công thực tế — v1).
 * - OT quy đổi từ otMinutes theo đơn giá giờ (26 ngày × 8h) × 150%.
 * - BHXH/BHYT trần 20× lương cơ sở; BHTN trần 20× lương tối thiểu vùng.
 * - PIT luỹ tiến sau giảm trừ bản thân + người phụ thuộc + BH bắt buộc.
 */
@Injectable()
export class PayrollEngineService {
  compute(config: EngineConfig, input: PayrollInput): PayslipResult {
    const base = input.baseSalary;
    const breakdown: PayslipBreakdownLine[] = [];
    breakdown.push({ label: 'Lương cơ bản', kind: 'EARNING', amount: base });

    // OT
    const hourlyRate = STD_WORKDAYS > 0 ? base / (STD_WORKDAYS * STD_HOURS_PER_DAY) : 0;
    const otPay = round((hourlyRate * input.otMinutes * OT_MULTIPLIER) / 60);
    if (otPay > 0) {
      breakdown.push({ label: 'Lương tăng ca (150%)', kind: 'EARNING', amount: otPay });
    }

    // Cấu phần lương
    let earnComponents = 0;
    let taxableComponents = 0;
    let otherDeductions = 0;
    for (const c of input.components) {
      if (c.kind === 'EARNING') {
        earnComponents += c.amount;
        if (c.taxable) taxableComponents += c.amount;
        breakdown.push({ label: c.name, kind: 'EARNING', amount: c.amount });
      } else {
        otherDeductions += c.amount;
        breakdown.push({ label: c.name, kind: 'DEDUCTION', amount: c.amount });
      }
    }

    // Phúc lợi
    let benefitSum = 0;
    let benefitTaxable = 0;
    for (const b of input.benefits) {
      benefitSum += b.amount;
      if (b.taxable) benefitTaxable += b.amount;
      breakdown.push({ label: b.name, kind: 'EARNING', amount: b.amount });
    }

    const grossEarnings = base + otPay + earnComponents + benefitSum;

    // Bảo hiểm bắt buộc (phần NV)
    const insBase = input.insuranceSalary ?? base;
    const cap2 = 20 * config.baseSalaryGov; // trần BHXH/BHYT
    const capBhtn = 20 * config.regionMinWage; // trần BHTN
    const bhxh = round((Math.min(insBase, cap2) * config.bhxhRateBps) / 10_000);
    const bhyt = round((Math.min(insBase, cap2) * config.bhytRateBps) / 10_000);
    const bhtn = round((Math.min(insBase, capBhtn) * config.bhtnRateBps) / 10_000);
    const insuranceTotal = bhxh + bhyt + bhtn;
    breakdown.push({ label: 'BHXH (8%)', kind: 'DEDUCTION', amount: bhxh });
    breakdown.push({ label: 'BHYT (1.5%)', kind: 'DEDUCTION', amount: bhyt });
    breakdown.push({ label: 'BHTN (1%)', kind: 'DEDUCTION', amount: bhtn });

    // Thuế TNCN
    const taxableGross = base + otPay + taxableComponents + benefitTaxable;
    const personalDeductions =
      config.personalDeduction + input.dependents * config.dependentDeduction;
    const assessable = Math.max(0, taxableGross - insuranceTotal - personalDeductions);
    const pit = progressivePit(assessable, config.pitBrackets);
    if (pit > 0) {
      breakdown.push({ label: 'Thuế TNCN', kind: 'DEDUCTION', amount: pit });
    }

    const netPay = grossEarnings - insuranceTotal - pit - otherDeductions;

    return {
      workdays: input.workdays,
      otMinutes: input.otMinutes,
      baseSalary: base,
      grossEarnings,
      taxableIncome: assessable,
      insuranceBase: insBase,
      bhxh,
      bhyt,
      bhtn,
      insuranceTotal,
      pit,
      otherDeductions,
      netPay,
      breakdown,
    };
  }
}
