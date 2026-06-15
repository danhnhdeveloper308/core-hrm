/**
 * Unit tests engine tính công (acceptance Phase 4) — thuần, không I/O.
 * Timezone test: Asia/Ho_Chi_Minh (UTC+7). Ca hành chính 08:00–17:00, grace 5p.
 */
import {
  computeTimesheet,
  localDayRangeUtc,
  localMinutesOfDay,
  tzOffsetMinutes,
  type DayClassification,
  type ShiftInfo,
} from './timesheet.engine';

const TZ = 'Asia/Ho_Chi_Minh';
const shift: ShiftInfo = {
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: 60,
  lateGraceMinutes: 5,
  otEnabled: false,
};
const workingDay: DayClassification = {
  working: true,
  dayType: 'WORKING',
  isHalfDay: false,
};

/** Tạo Date UTC tương ứng giờ local VN (YYYY-MM-DD + HH:mm, +07). */
function vn(date: string, time: string): Date {
  const { start } = localDayRangeUtc(date, TZ);
  const [h, m] = time.split(':').map(Number);
  return new Date(start.getTime() + ((h ?? 0) * 60 + (m ?? 0)) * 60_000);
}

describe('tz helpers', () => {
  it('offset VN = +420 phút', () => {
    expect(tzOffsetMinutes(new Date('2026-06-15T00:00:00Z'), TZ)).toBe(420);
  });
  it('localMinutesOfDay: 08:30 VN', () => {
    expect(localMinutesOfDay(vn('2026-06-15', '08:30'), TZ)).toBe(8 * 60 + 30);
  });
  it('localDayRangeUtc: nửa đêm VN = 17:00Z hôm trước', () => {
    const { start } = localDayRangeUtc('2026-06-15', TZ);
    expect(start.toISOString()).toBe('2026-06-14T17:00:00.000Z');
  });
});

describe('computeTimesheet', () => {
  const base = { shift, day: workingDay, leave: null, timezone: TZ, isPast: true } as const;

  it('vào đúng giờ, ra đúng giờ → PRESENT, không trễ/sớm', () => {
    const r = computeTimesheet({
      ...base,
      logTimes: [vn('2026-06-15', '08:00'), vn('2026-06-15', '17:00')],
    });
    expect(r.status).toBe('PRESENT');
    expect(r.lateMinutes).toBe(0);
    expect(r.earlyMinutes).toBe(0);
    expect(r.workMinutes).toBe(9 * 60 - 60); // 8h trừ nghỉ 60p
  });

  it('vào trễ quá grace → LATE với số phút đúng', () => {
    const r = computeTimesheet({
      ...base,
      logTimes: [vn('2026-06-15', '08:20'), vn('2026-06-15', '17:00')],
    });
    expect(r.status).toBe('LATE');
    expect(r.lateMinutes).toBe(15); // 08:20 - (08:00 + 5p grace)
  });

  it('vào trong grace → KHÔNG tính trễ', () => {
    const r = computeTimesheet({
      ...base,
      logTimes: [vn('2026-06-15', '08:04'), vn('2026-06-15', '17:00')],
    });
    expect(r.status).toBe('PRESENT');
    expect(r.lateMinutes).toBe(0);
  });

  it('về sớm → EARLY_LEAVE; vừa trễ vừa sớm → LATE_AND_EARLY', () => {
    const early = computeTimesheet({
      ...base,
      logTimes: [vn('2026-06-15', '08:00'), vn('2026-06-15', '16:30')],
    });
    expect(early.status).toBe('EARLY_LEAVE');
    expect(early.earlyMinutes).toBe(30);

    const both = computeTimesheet({
      ...base,
      logTimes: [vn('2026-06-15', '08:30'), vn('2026-06-15', '16:30')],
    });
    expect(both.status).toBe('LATE_AND_EARLY');
  });

  it('có ca, không log, ngày đã qua → ABSENT', () => {
    const r = computeTimesheet({ ...base, logTimes: [] });
    expect(r.status).toBe('ABSENT');
  });

  it('có ca, không log, ngày chưa tới → NOT_SCHEDULED (chưa kết luận vắng)', () => {
    const r = computeTimesheet({ ...base, isPast: false, logTimes: [] });
    expect(r.status).toBe('NOT_SCHEDULED');
  });

  it('ngày lễ cả ngày → HOLIDAY', () => {
    const r = computeTimesheet({
      ...base,
      day: { working: false, dayType: 'HOLIDAY', isHalfDay: false },
      logTimes: [],
    });
    expect(r.status).toBe('HOLIDAY');
  });

  it('cuối tuần → WEEKEND', () => {
    const r = computeTimesheet({
      ...base,
      day: { working: false, dayType: 'WEEKEND', isHalfDay: false },
      logTimes: [],
    });
    expect(r.status).toBe('WEEKEND');
  });

  it('nghỉ phép cả ngày → ON_LEAVE; nửa ngày → HALF_LEAVE', () => {
    expect(
      computeTimesheet({ ...base, leave: 'FULL', logTimes: [] }).status,
    ).toBe('ON_LEAVE');
    expect(
      computeTimesheet({ ...base, leave: 'HALF', logTimes: [] }).status,
    ).toBe('HALF_LEAVE');
  });

  it('không có ca → NOT_SCHEDULED', () => {
    const r = computeTimesheet({
      ...base,
      shift: null,
      logTimes: [vn('2026-06-15', '08:00')],
    });
    expect(r.status).toBe('NOT_SCHEDULED');
  });

  it('otEnabled: ra muộn hơn giờ ca → tính OT', () => {
    const r = computeTimesheet({
      ...base,
      shift: { ...shift, otEnabled: true },
      logTimes: [vn('2026-06-15', '08:00'), vn('2026-06-15', '19:00')],
    });
    expect(r.otMinutes).toBe(120); // 19:00 - 17:00
  });
});
