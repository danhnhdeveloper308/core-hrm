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
  breakStart: null,
  breakEnd: null,
  breakMinutes: 60,
  lateGraceMinutes: 5,
  otEnabled: false,
};
const workingDay: DayClassification = {
  working: true,
  dayType: 'WORKING',
};

/** Tạo Date UTC tương ứng giờ local VN (YYYY-MM-DD + HH:mm, +07). */
function vn(date: string, time: string): Date {
  const { start } = localDayRangeUtc(date, TZ);
  const [h, m] = time.split(':').map(Number);
  return new Date(start.getTime() + ((h ?? 0) * 60 + (m ?? 0)) * 60_000);
}

/** Cặp log VÀO + RA cho test. */
function inOut(date: string, inT: string, outT: string) {
  return [
    { at: vn(date, inT), type: 'IN' as const },
    { at: vn(date, outT), type: 'OUT' as const },
  ];
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
      logs: inOut('2026-06-15', '08:00', '17:00'),
    });
    expect(r.status).toBe('PRESENT');
    expect(r.lateMinutes).toBe(0);
    expect(r.earlyMinutes).toBe(0);
    expect(r.workMinutes).toBe(9 * 60 - 60); // 8h trừ nghỉ 60p
  });

  it('vào trễ quá grace → LATE với số phút đúng', () => {
    const r = computeTimesheet({
      ...base,
      logs: inOut('2026-06-15', '08:20', '17:00'),
    });
    expect(r.status).toBe('LATE');
    expect(r.lateMinutes).toBe(15); // 08:20 - (08:00 + 5p grace)
  });

  it('vào trong grace → KHÔNG tính trễ', () => {
    const r = computeTimesheet({
      ...base,
      logs: inOut('2026-06-15', '08:04', '17:00'),
    });
    expect(r.status).toBe('PRESENT');
    expect(r.lateMinutes).toBe(0);
  });

  it('về sớm → EARLY_LEAVE; vừa trễ vừa sớm → LATE_AND_EARLY', () => {
    const early = computeTimesheet({
      ...base,
      logs: inOut('2026-06-15', '08:00', '16:30'),
    });
    expect(early.status).toBe('EARLY_LEAVE');
    expect(early.earlyMinutes).toBe(30);

    const both = computeTimesheet({
      ...base,
      logs: inOut('2026-06-15', '08:30', '16:30'),
    });
    expect(both.status).toBe('LATE_AND_EARLY');
  });

  it('có ca, không log, ngày đã qua → ABSENT', () => {
    const r = computeTimesheet({ ...base, logs: [] });
    expect(r.status).toBe('ABSENT');
  });

  it('có ca, không log, ngày chưa tới → NOT_SCHEDULED (chưa kết luận vắng)', () => {
    const r = computeTimesheet({ ...base, isPast: false, logs: [] });
    expect(r.status).toBe('NOT_SCHEDULED');
  });

  it('ngày lễ cả ngày → HOLIDAY', () => {
    const r = computeTimesheet({
      ...base,
      day: { working: false, dayType: 'HOLIDAY' },
      logs: [],
    });
    expect(r.status).toBe('HOLIDAY');
  });

  it('cuối tuần → WEEKEND', () => {
    const r = computeTimesheet({
      ...base,
      day: { working: false, dayType: 'WEEKEND' },
      logs: [],
    });
    expect(r.status).toBe('WEEKEND');
  });

  it('nghỉ phép cả ngày → ON_LEAVE; nửa ngày → HALF_LEAVE', () => {
    expect(
      computeTimesheet({ ...base, leave: 'FULL', logs: [] }).status,
    ).toBe('ON_LEAVE');
    expect(
      computeTimesheet({ ...base, leave: 'HALF', logs: [] }).status,
    ).toBe('HALF_LEAVE');
  });

  it('không có ca → NOT_SCHEDULED', () => {
    const r = computeTimesheet({
      ...base,
      shift: null,
      logs: [{ at: vn('2026-06-15', '08:00'), type: 'IN' }],
    });
    expect(r.status).toBe('NOT_SCHEDULED');
  });

  it('otEnabled: ra muộn hơn giờ ca → tính OT', () => {
    const r = computeTimesheet({
      ...base,
      shift: { ...shift, otEnabled: true },
      logs: inOut('2026-06-15', '08:00', '19:00'),
    });
    expect(r.otMinutes).toBe(120); // 19:00 - 17:00
  });

  it('cửa sổ nghỉ trưa: ca 7:30-16:30 nghỉ 11:30-12:30, về sớm 14:00 → 5.5h', () => {
    const lunchShift: ShiftInfo = {
      startTime: '07:30',
      endTime: '16:30',
      breakStart: '11:30',
      breakEnd: '12:30',
      breakMinutes: 60,
      lateGraceMinutes: 5,
      otEnabled: false,
    };
    const r = computeTimesheet({
      ...base,
      shift: lunchShift,
      logs: inOut('2026-06-15', '07:30', '14:00'),
    });
    // [7:30,14:00]=390p − giao nghỉ trưa [11:30,12:30]=60p = 330p = 5.5h
    expect(r.workMinutes).toBe(330);
    expect(r.earlyMinutes).toBe(150); // 16:30 - 14:00
    expect(r.status).toBe('EARLY_LEAVE');
  });

  it('cửa sổ nghỉ trưa: làm đủ ca 7:30-16:30 → 8h công (trừ 1h trưa)', () => {
    const lunchShift: ShiftInfo = {
      startTime: '07:30',
      endTime: '16:30',
      breakStart: '11:30',
      breakEnd: '12:30',
      breakMinutes: 60,
      lateGraceMinutes: 5,
      otEnabled: false,
    };
    const r = computeTimesheet({
      ...base,
      shift: lunchShift,
      logs: inOut('2026-06-15', '07:30', '16:30'),
    });
    expect(r.workMinutes).toBe(8 * 60); // 9h ca − 1h nghỉ trưa = 8h
    expect(r.status).toBe('PRESENT');
  });

  it('nhiều log VÀO/RA: firstIn = VÀO sớm nhất, lastOut = RA muộn nhất', () => {
    const r = computeTimesheet({
      ...base,
      logs: [
        { at: vn('2026-06-15', '08:00'), type: 'IN' },
        { at: vn('2026-06-15', '08:05'), type: 'OUT' },
        { at: vn('2026-06-15', '08:10'), type: 'IN' },
        { at: vn('2026-06-15', '17:00'), type: 'OUT' },
      ],
    });
    expect(r.firstIn).toEqual(vn('2026-06-15', '08:00'));
    expect(r.lastOut).toEqual(vn('2026-06-15', '17:00'));
    expect(r.status).toBe('PRESENT');
  });

  it('chấm nhiều lần loạn thứ tự: vẫn lấy VÀO đầu + RA cuối theo ca', () => {
    const r = computeTimesheet({
      ...base,
      // cố tình đảo thứ tự + nhiều cặp trong ngày
      logs: [
        { at: vn('2026-06-15', '12:00'), type: 'OUT' },
        { at: vn('2026-06-15', '08:01'), type: 'IN' },
        { at: vn('2026-06-15', '17:30'), type: 'OUT' },
        { at: vn('2026-06-15', '13:00'), type: 'IN' },
        { at: vn('2026-06-15', '10:00'), type: 'IN' },
      ],
    });
    expect(r.firstIn).toEqual(vn('2026-06-15', '08:01')); // VÀO sớm nhất
    expect(r.lastOut).toEqual(vn('2026-06-15', '17:30')); // RA muộn nhất
    expect(r.status).toBe('PRESENT');
  });

  it('lỡ chấm thêm 1 lần VÀO sau khi đã chấm RA → lastOut vẫn là lần RA', () => {
    const r = computeTimesheet({
      ...base,
      logs: [
        { at: vn('2026-06-15', '08:00'), type: 'IN' },
        { at: vn('2026-06-15', '17:00'), type: 'OUT' },
        { at: vn('2026-06-15', '17:05'), type: 'IN' }, // bấm nhầm sau khi RA
      ],
    });
    expect(r.firstIn).toEqual(vn('2026-06-15', '08:00')); // VÀO đầu tiên
    expect(r.lastOut).toEqual(vn('2026-06-15', '17:00')); // RA cuối cùng (không tính lần IN nhầm)
    expect(r.status).toBe('PRESENT');
  });
});
