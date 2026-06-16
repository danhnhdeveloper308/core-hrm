/** Engine chính sách nghỉ phép — thuần, không I/O, dễ test (spec 2.6). */

export interface LeavePolicyInfo {
  daysPerYear: number;
  accrualType: 'YEARLY_UPFRONT' | 'MONTHLY';
  prorateFirstYear: boolean;
  seniorityBonusDays: number;
  seniorityEveryYears: number;
}

/** Số năm thâm niên tính tới đầu năm `year`. */
export function yearsOfService(joinDate: Date, year: number): number {
  const joinYear = joinDate.getUTCFullYear();
  return Math.max(0, year - joinYear);
}

/** Thưởng thâm niên: +bonus mỗi `every` năm. */
export function seniorityBonus(policy: LeavePolicyInfo, joinDate: Date, year: number): number {
  if (policy.seniorityBonusDays <= 0) return 0;
  const yos = yearsOfService(joinDate, year);
  return Math.floor(yos / policy.seniorityEveryYears) * policy.seniorityBonusDays;
}

/** Hệ số pro-rata năm đầu = số tháng còn lại / 12 (vào giữa năm). */
export function prorateFactor(joinDate: Date, year: number): number {
  if (joinDate.getUTCFullYear() !== year) return 1;
  const monthsLeft = 12 - joinDate.getUTCMonth(); // tháng vào tính trọn
  return monthsLeft / 12;
}

/** Quota cả năm (YEARLY_UPFRONT) — gồm seniority + pro-rata năm đầu nếu bật. */
export function yearlyQuota(
  policy: LeavePolicyInfo,
  joinDate: Date,
  year: number,
): number {
  const base = policy.daysPerYear + seniorityBonus(policy, joinDate, year);
  const factor = policy.prorateFirstYear ? prorateFactor(joinDate, year) : 1;
  return round2(base * factor);
}

/** Phụ cấp cộng dồn cho 1 tháng (MONTHLY) = quota năm / 12. */
export function monthlyAccrual(
  policy: LeavePolicyInfo,
  joinDate: Date,
  year: number,
): number {
  const base = policy.daysPerYear + seniorityBonus(policy, joinDate, year);
  return round2(base / 12);
}

/** Các tháng nhân viên được cộng dồn trong năm (>= tháng vào nếu là năm đầu). */
export function accrualMonths(joinDate: Date, year: number): number[] {
  const startMonth = joinDate.getUTCFullYear() === year ? joinDate.getUTCMonth() + 1 : 1;
  const months: number[] = [];
  for (let m = startMonth; m <= 12; m++) months.push(m);
  return months;
}

/**
 * Số ngày phép của 1 đơn: đếm ngày làm việc trong [start, end], trừ ngày
 * nghỉ/cuối tuần (qua predicate isWorking). Nửa ngày đầu/cuối = 0.5.
 * dates: danh sách "YYYY-MM-DD" liên tục từ start tới end.
 */
export function leaveDaysCount(
  dates: string[],
  startHalf: 'FULL' | 'AM' | 'PM',
  endHalf: 'FULL' | 'AM' | 'PM',
  isWorking: (date: string) => boolean,
): number {
  const working = dates.filter(isWorking);
  if (working.length === 0) return 0;
  if (working.length === 1) {
    // 1 ngày: nửa buổi nếu startHalf hoặc endHalf không FULL
    return startHalf !== 'FULL' || endHalf !== 'FULL' ? 0.5 : 1;
  }
  let total = working.length;
  const first = working[0]!;
  const last = working[working.length - 1]!;
  if (startHalf !== 'FULL' && first === dates.find(isWorking)) total -= 0.5;
  if (endHalf !== 'FULL' && last === [...dates].reverse().find(isWorking)) total -= 0.5;
  return round2(total);
}

/** Liệt kê các ngày "YYYY-MM-DD" từ start tới end (bao gồm 2 đầu). */
export function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  let guard = 0;
  while (cur <= last && guard++ < 366) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
