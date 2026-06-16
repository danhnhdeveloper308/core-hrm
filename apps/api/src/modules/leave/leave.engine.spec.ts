/** Unit tests engine chính sách phép (acceptance Phase 7). */
import {
  accrualMonths,
  enumerateDates,
  leaveDaysCount,
  monthlyAccrual,
  prorateFactor,
  seniorityBonus,
  yearlyQuota,
  type LeavePolicyInfo,
} from './leave.engine';

const base: LeavePolicyInfo = {
  daysPerYear: 12,
  accrualType: 'YEARLY_UPFRONT',
  prorateFirstYear: true,
  seniorityBonusDays: 0,
  seniorityEveryYears: 5,
};

describe('pro-rata năm đầu', () => {
  it('vào tháng 7 (index 6) → 6/12 quota', () => {
    const join = new Date('2026-07-15');
    expect(prorateFactor(join, 2026)).toBeCloseTo(6 / 12, 5);
    expect(yearlyQuota(base, join, 2026)).toBeCloseTo(6, 2); // 12 * 0.5
  });
  it('năm sau vào việc → đủ 12', () => {
    const join = new Date('2026-07-15');
    expect(yearlyQuota(base, join, 2027)).toBe(12);
  });
  it('tắt prorate → đủ quota dù vào giữa năm', () => {
    const join = new Date('2026-07-15');
    expect(yearlyQuota({ ...base, prorateFirstYear: false }, join, 2026)).toBe(12);
  });
});

describe('seniority bonus', () => {
  const policy: LeavePolicyInfo = { ...base, seniorityBonusDays: 1, seniorityEveryYears: 5 };
  it('+1 ngày mỗi 5 năm thâm niên', () => {
    const join = new Date('2016-01-01');
    expect(seniorityBonus(policy, join, 2026)).toBe(2); // 10 năm → +2
    expect(yearlyQuota(policy, join, 2026)).toBe(14); // 12 + 2
  });
  it('dưới 5 năm → 0 bonus', () => {
    expect(seniorityBonus(policy, new Date('2024-01-01'), 2026)).toBe(0);
  });
});

describe('monthly accrual', () => {
  it('12 ngày/năm → 1 ngày/tháng', () => {
    expect(monthlyAccrual(base, new Date('2020-01-01'), 2026)).toBe(1);
  });
  it('vào tháng 10 → chỉ các tháng 10,11,12 được cộng', () => {
    expect(accrualMonths(new Date('2026-10-05'), 2026)).toEqual([10, 11, 12]);
  });
  it('năm sau vào việc → đủ 12 tháng', () => {
    expect(accrualMonths(new Date('2026-10-05'), 2027)).toHaveLength(12);
  });
});

describe('đếm số ngày phép', () => {
  // Thứ 2-6 làm việc; cuối tuần nghỉ
  const isWorking = (d: string) => {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    return wd >= 1 && wd <= 5;
  };
  it('nghỉ trọn 1 tuần làm việc (T2-T6) = 5 ngày', () => {
    const dates = enumerateDates('2026-06-15', '2026-06-19'); // T2..T6
    expect(leaveDaysCount(dates, 'FULL', 'FULL', isWorking)).toBe(5);
  });
  it('khoảng có cuối tuần → chỉ đếm ngày làm việc', () => {
    const dates = enumerateDates('2026-06-15', '2026-06-21'); // T2..CN
    expect(leaveDaysCount(dates, 'FULL', 'FULL', isWorking)).toBe(5);
  });
  it('nghỉ 1 ngày buổi chiều = 0.5', () => {
    const dates = enumerateDates('2026-06-15', '2026-06-15');
    expect(leaveDaysCount(dates, 'PM', 'PM', isWorking)).toBe(0.5);
  });
  it('nghỉ nửa ngày đầu + nguyên ngày sau = 1.5 (2 ngày làm việc)', () => {
    const dates = enumerateDates('2026-06-15', '2026-06-16');
    expect(leaveDaysCount(dates, 'PM', 'FULL', isWorking)).toBe(1.5);
  });
});
