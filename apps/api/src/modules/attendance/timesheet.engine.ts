import type { TimesheetStatus } from '@repo/shared';

export interface ShiftInfo {
  startTime: string; // "HH:mm"
  endTime: string;
  /** Cửa sổ nghỉ trưa "HH:mm"; null → dùng breakMinutes trừ cứng. */
  breakStart: string | null;
  breakEnd: string | null;
  breakMinutes: number;
  lateGraceMinutes: number;
  otEnabled: boolean;
}

export interface AttendanceLogPoint {
  at: Date;
  type: 'IN' | 'OUT' | 'UNKNOWN';
}

export interface DayClassification {
  working: boolean;
  dayType: 'WORKING' | 'WEEKEND' | 'HOLIDAY';
  isHalfDay: boolean;
}

export interface TimesheetInput {
  shift: ShiftInfo | null;
  day: DayClassification;
  /** Các log trong ngày (local-day range), không cần sort sẵn. */
  logs: AttendanceLogPoint[];
  /** Trạng thái nghỉ phép đã duyệt phủ ngày này (Phase 7 mới truyền). */
  leave: 'FULL' | 'HALF' | null;
  timezone: string;
  /** Ngày đang tính < hôm nay → cho phép kết luận ABSENT khi không có log. */
  isPast: boolean;
}

export interface TimesheetResult {
  status: TimesheetStatus;
  firstIn: Date | null;
  lastOut: Date | null;
  lateMinutes: number;
  earlyMinutes: number;
  workMinutes: number;
  otMinutes: number;
}

/** Offset phút (local - UTC) của tz tại 1 thời điểm — VN cố định +420, không DST. */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return (asUtc - date.getTime()) / 60_000;
}

/** Phút kể từ nửa đêm (giờ địa phương tz) của 1 thời điểm. */
export function localMinutesOfDay(date: Date, timeZone: string): number {
  const offset = tzOffsetMinutes(date, timeZone);
  const localMs = date.getTime() + offset * 60_000;
  const totalMin = Math.floor(localMs / 60_000) % (24 * 60);
  return (totalMin + 24 * 60) % (24 * 60);
}

/** Khoảng [start, end) UTC tương ứng 1 ngày local (dateStr "YYYY-MM-DD"). */
export function localDayRangeUtc(
  dateStr: string,
  timeZone: string,
): { start: Date; end: Date } {
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const offset = tzOffsetMinutes(guess, timeZone);
  const start = new Date(guess.getTime() - offset * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function parseHHmm(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Độ dài giao nhau (phút) của 2 khoảng [a1,a2] và [b1,b2]. */
function overlapMinutes(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

/**
 * Tính TimesheetDay từ dữ liệu gốc — thuần, không I/O, dễ test.
 * Ưu tiên: nghỉ phép → ngày lễ → cuối tuần → chưa xếp ca → tính công.
 */
export function computeTimesheet(input: TimesheetInput): TimesheetResult {
  const empty: TimesheetResult = {
    status: 'NOT_SCHEDULED',
    firstIn: null,
    lastOut: null,
    lateMinutes: 0,
    earlyMinutes: 0,
    workMinutes: 0,
    otMinutes: 0,
  };

  const sorted = [...input.logs].sort((a, b) => a.at.getTime() - b.at.getTime());
  // firstIn = lần VÀO sớm nhất; lastOut = lần RA muộn nhất.
  // Không có log đúng loại → fallback theo thứ tự thời gian (vd UNKNOWN từ máy vân tay).
  const ins = sorted.filter((l) => l.type === 'IN');
  const outs = sorted.filter((l) => l.type === 'OUT');
  const firstIn = (ins[0] ?? sorted[0])?.at ?? null;
  const lastOut =
    outs.length > 0
      ? outs[outs.length - 1]!.at
      : sorted.length > 1
        ? sorted[sorted.length - 1]!.at
        : null;

  if (input.leave === 'FULL') return { ...empty, status: 'ON_LEAVE', firstIn, lastOut };
  if (input.leave === 'HALF') return { ...empty, status: 'HALF_LEAVE', firstIn, lastOut };

  // Lễ cả ngày → HOLIDAY; lễ nửa ngày vẫn tính công như ngày làm
  if (input.day.dayType === 'HOLIDAY' && !input.day.working) {
    return { ...empty, status: 'HOLIDAY', firstIn, lastOut };
  }
  if (input.day.dayType === 'WEEKEND') {
    return { ...empty, status: 'WEEKEND', firstIn, lastOut };
  }
  if (!input.shift) {
    return { ...empty, status: 'NOT_SCHEDULED', firstIn, lastOut };
  }

  if (sorted.length === 0) {
    // Ngày làm việc, có ca, không log → vắng (chỉ kết luận khi ngày đã qua)
    return { ...empty, status: input.isPast ? 'ABSENT' : 'NOT_SCHEDULED' };
  }

  const shiftStart = parseHHmm(input.shift.startTime);
  const shiftEnd = parseHHmm(input.shift.endTime);
  const inMin = localMinutesOfDay(firstIn!, input.timezone);

  const lateMinutes = Math.max(
    0,
    inMin - (shiftStart + input.shift.lateGraceMinutes),
  );

  let earlyMinutes = 0;
  let otMinutes = 0;
  let workMinutes = 0;
  if (lastOut) {
    const outMin = localMinutesOfDay(lastOut, input.timezone);
    earlyMinutes = Math.max(0, shiftEnd - outMin);
    otMinutes = input.shift.otEnabled ? Math.max(0, outMin - shiftEnd) : 0;

    // Giờ công = phần [in,out] nằm TRONG ca, trừ phần giao với nghỉ trưa.
    const workStart = Math.max(inMin, shiftStart);
    const workEnd = Math.min(outMin, shiftEnd);
    let span = Math.max(0, workEnd - workStart);
    if (input.shift.breakStart && input.shift.breakEnd) {
      span -= overlapMinutes(
        workStart,
        workEnd,
        parseHHmm(input.shift.breakStart),
        parseHHmm(input.shift.breakEnd),
      );
    } else {
      // Không cấu hình cửa sổ → chỉ trừ cứng breakMinutes nếu làm đủ dài
      span -= span > input.shift.breakMinutes ? input.shift.breakMinutes : 0;
    }
    workMinutes = Math.max(0, Math.round(span));
  }

  let status: TimesheetStatus;
  if (lateMinutes > 0 && earlyMinutes > 0) status = 'LATE_AND_EARLY';
  else if (lateMinutes > 0) status = 'LATE';
  else if (earlyMinutes > 0) status = 'EARLY_LEAVE';
  else status = 'PRESENT';

  return { status, firstIn, lastOut, lateMinutes, earlyMinutes, workMinutes, otMinutes };
}
