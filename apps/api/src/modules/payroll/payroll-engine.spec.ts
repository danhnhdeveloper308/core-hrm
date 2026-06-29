/** Unit tests engine tính lương VN (PIT luỹ tiến + BHXH/BHYT/BHTN). */
import { VN_PAYROLL_DEFAULTS } from '@repo/shared';
import {
  PayrollEngineService,
  progressivePit,
  type EngineConfig,
  type PayrollInput,
} from './payroll-engine.service';

const config: EngineConfig = {
  personalDeduction: VN_PAYROLL_DEFAULTS.personalDeduction,
  dependentDeduction: VN_PAYROLL_DEFAULTS.dependentDeduction,
  baseSalaryGov: VN_PAYROLL_DEFAULTS.baseSalaryGov,
  regionMinWage: VN_PAYROLL_DEFAULTS.regionMinWage,
  bhxhRateBps: VN_PAYROLL_DEFAULTS.bhxhRateBps,
  bhytRateBps: VN_PAYROLL_DEFAULTS.bhytRateBps,
  bhtnRateBps: VN_PAYROLL_DEFAULTS.bhtnRateBps,
  pitBrackets: VN_PAYROLL_DEFAULTS.pitBrackets.map((b) => ({ ...b })),
};

const emptyInput = (over: Partial<PayrollInput>): PayrollInput => ({
  baseSalary: 0,
  insuranceSalary: null,
  components: [],
  benefits: [],
  dependents: 0,
  workdays: 26,
  otMinutes: 0,
  ...over,
});

describe('progressivePit (luỹ tiến từng phần)', () => {
  it('income ≤ 0 → thuế 0', () => {
    expect(progressivePit(0, config.pitBrackets)).toBe(0);
    expect(progressivePit(-100, config.pitBrackets)).toBe(0);
  });

  it('15.850.000 → 1.627.500 (công thức 0.15×TN − 750k)', () => {
    expect(progressivePit(15_850_000, config.pitBrackets)).toBe(1_627_500);
  });

  it('5.000.000 đúng biên bậc 1 → 250.000', () => {
    expect(progressivePit(5_000_000, config.pitBrackets)).toBe(250_000);
  });
});

describe('compute — lương 30tr, 0 phụ thuộc', () => {
  const engine = new PayrollEngineService();
  const r = engine.compute(config, emptyInput({ baseSalary: 30_000_000 }));

  it('BHXH/BHYT/BHTN (8/1.5/1%)', () => {
    expect(r.bhxh).toBe(2_400_000);
    expect(r.bhyt).toBe(450_000);
    expect(r.bhtn).toBe(300_000);
    expect(r.insuranceTotal).toBe(3_150_000);
  });

  it('thu nhập tính thuế = 15.850.000', () => {
    expect(r.taxableIncome).toBe(15_850_000);
  });

  it('PIT = 1.627.500', () => {
    expect(r.pit).toBe(1_627_500);
  });

  it('thực lĩnh = gross − BH − PIT', () => {
    expect(r.grossEarnings).toBe(30_000_000);
    expect(r.netPay).toBe(30_000_000 - 3_150_000 - 1_627_500);
  });
});

describe('compute — trần BHXH/BHYT (20× lương cơ sở)', () => {
  const engine = new PayrollEngineService();
  it('lương đóng BH cao hơn trần → đóng theo trần', () => {
    const cap = 20 * config.baseSalaryGov; // 46.8tr
    const r = engine.compute(
      config,
      emptyInput({ baseSalary: 100_000_000, insuranceSalary: 100_000_000 }),
    );
    expect(r.bhxh).toBe(Math.round((cap * config.bhxhRateBps) / 10_000));
  });
});

describe('compute — người phụ thuộc giảm thuế', () => {
  const engine = new PayrollEngineService();
  it('2 người phụ thuộc giảm thu nhập tính thuế 8.8tr', () => {
    const r0 = engine.compute(config, emptyInput({ baseSalary: 30_000_000 }));
    const r2 = engine.compute(
      config,
      emptyInput({ baseSalary: 30_000_000, dependents: 2 }),
    );
    expect(r0.taxableIncome - r2.taxableIncome).toBe(
      2 * config.dependentDeduction,
    );
    expect(r2.pit).toBeLessThan(r0.pit);
  });
});
