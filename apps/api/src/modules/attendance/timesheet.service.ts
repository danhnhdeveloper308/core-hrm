import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { TimesheetDayResponse } from '@repo/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { TimesheetDay } from '../../prisma/prisma.types';
import { CalendarsService } from '../schedule/calendars.service';
import { ShiftsService } from '../schedule/shifts.service';
import {
  computeTimesheet,
  localDayRangeUtc,
  type DayClassification,
} from './timesheet.engine';

export function toTimesheetResponse(t: TimesheetDay): TimesheetDayResponse {
  return {
    id: t.id,
    employeeId: t.employeeId,
    date: t.date.toISOString().slice(0, 10),
    shiftId: t.shiftId,
    firstIn: t.firstIn?.toISOString() ?? null,
    lastOut: t.lastOut?.toISOString() ?? null,
    status: t.status,
    lateMinutes: t.lateMinutes,
    earlyMinutes: t.earlyMinutes,
    workMinutes: t.workMinutes,
    otMinutes: t.otMinutes,
    locked: t.locked,
    note: t.note,
  };
}

@Injectable()
export class TimesheetService {
  private readonly logger = new Logger(TimesheetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shifts: ShiftsService,
    private readonly calendars: CalendarsService,
  ) {}

  /**
   * Tính lại TimesheetDay cho (employeeId, date) từ dữ liệu gốc — idempotent.
   * Gọi bởi worker `timesheet-recalc`. date = "YYYY-MM-DD" (giờ địa phương org).
   */
  async recalc(orgId: string, employeeId: string, date: string): Promise<void> {
    // Ngày đã bị HR khóa (sửa tay) → KHÔNG ghi đè bằng tính toán tự động
    const existing = await this.prisma.timesheetDay.findUnique({
      where: { employeeId_date: { employeeId, date: new Date(date) } },
      select: { locked: true },
    });
    if (existing?.locked) return;

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, orgId },
      select: { orgUnitId: true, org: { select: { timezone: true } } },
    });
    if (!employee) return;
    const timezone = employee.org.timezone;

    const shift = await this.shifts.resolveShift(employeeId, date);
    const dayInfo = await this.calendars.isWorkingDay(
      orgId,
      employee.orgUnitId,
      date,
      shift?.workDays,
    );

    const { start, end } = localDayRangeUtc(date, timezone);
    const logs = await this.prisma.attendanceLog.findMany({
      where: { employeeId, recordedAt: { gte: start, lt: end } },
      select: { recordedAt: true, type: true },
    });

    // Nghỉ phép (Phase 7 sẽ thay bằng truy vấn LeaveRequest APPROVED)
    const leave = await this.resolveLeave();

    const todayStr = this.localToday(timezone);
    const result = computeTimesheet({
      shift: shift
        ? {
            startTime: shift.startTime,
            endTime: shift.endTime,
            breakStart: shift.breakStart,
            breakEnd: shift.breakEnd,
            breakMinutes: shift.breakMinutes,
            lateGraceMinutes: shift.lateGraceMinutes,
            otEnabled: shift.otEnabled,
          }
        : null,
      day: dayInfo as DayClassification,
      logs: logs.map((l) => ({ at: l.recordedAt, type: l.type })),
      leave,
      timezone,
      isPast: date < todayStr,
    });

    await this.prisma.timesheetDay.upsert({
      where: { employeeId_date: { employeeId, date: new Date(date) } },
      create: {
        orgId,
        employeeId,
        date: new Date(date),
        shiftId: shift?.id ?? null,
        firstIn: result.firstIn,
        lastOut: result.lastOut,
        status: result.status,
        lateMinutes: result.lateMinutes,
        earlyMinutes: result.earlyMinutes,
        workMinutes: result.workMinutes,
        otMinutes: result.otMinutes,
      },
      update: {
        shiftId: shift?.id ?? null,
        firstIn: result.firstIn,
        lastOut: result.lastOut,
        status: result.status,
        lateMinutes: result.lateMinutes,
        earlyMinutes: result.earlyMinutes,
        workMinutes: result.workMinutes,
        otMinutes: result.otMinutes,
      },
    });
  }

  /**
   * Reset công 1 ngày: xóa toàn bộ AttendanceLog trong ngày + TimesheetDay,
   * rồi tính lại từ con số 0 (→ ABSENT/NOT_SCHEDULED). Gỡ khóa luôn.
   */
  async resetDay(orgId: string, employeeId: string, date: string): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, orgId },
      select: { org: { select: { timezone: true } } },
    });
    if (!employee) return;
    const { start, end } = localDayRangeUtc(date, employee.org.timezone);
    await this.prisma.$transaction([
      this.prisma.attendanceLog.deleteMany({
        where: { orgId, employeeId, recordedAt: { gte: start, lt: end } },
      }),
      this.prisma.timesheetDay.deleteMany({
        where: { employeeId, date: new Date(date) },
      }),
    ]);
    await this.recalc(orgId, employeeId, date);
  }

  /**
   * HR sửa giờ công thủ công: tính lại từ giờ vào/ra HR nhập (qua engine để
   * số liệu nhất quán) rồi KHÓA (locked) — recalc tự động sẽ không ghi đè.
   */
  async applyEdit(
    orgId: string,
    employeeId: string,
    date: string,
    firstIn: string,
    lastOut: string | null,
    note: string | null,
  ): Promise<void> {
    const employee = await this.prisma.employee.findFirstOrThrow({
      where: { id: employeeId, orgId },
      select: { orgUnitId: true, org: { select: { timezone: true } } },
    });
    const timezone = employee.org.timezone;
    const shift = await this.shifts.resolveShift(employeeId, date);
    const dayInfo = await this.calendars.isWorkingDay(
      orgId,
      employee.orgUnitId,
      date,
      shift?.workDays,
    );
    const { start } = localDayRangeUtc(date, timezone);
    const toUtc = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return new Date(start.getTime() + ((h ?? 0) * 60 + (m ?? 0)) * 60_000);
    };
    const logs: { at: Date; type: 'IN' | 'OUT' }[] = [
      { at: toUtc(firstIn), type: 'IN' },
    ];
    if (lastOut) logs.push({ at: toUtc(lastOut), type: 'OUT' });

    const result = computeTimesheet({
      shift: shift
        ? {
            startTime: shift.startTime,
            endTime: shift.endTime,
            breakStart: shift.breakStart,
            breakEnd: shift.breakEnd,
            breakMinutes: shift.breakMinutes,
            lateGraceMinutes: shift.lateGraceMinutes,
            otEnabled: shift.otEnabled,
          }
        : null,
      day: dayInfo as DayClassification,
      logs,
      leave: null,
      timezone,
      isPast: true,
    });

    await this.prisma.timesheetDay.upsert({
      where: { employeeId_date: { employeeId, date: new Date(date) } },
      create: {
        orgId,
        employeeId,
        date: new Date(date),
        shiftId: shift?.id ?? null,
        firstIn: result.firstIn,
        lastOut: result.lastOut,
        status: result.status,
        lateMinutes: result.lateMinutes,
        earlyMinutes: result.earlyMinutes,
        workMinutes: result.workMinutes,
        otMinutes: result.otMinutes,
        locked: true,
        note,
      },
      update: {
        shiftId: shift?.id ?? null,
        firstIn: result.firstIn,
        lastOut: result.lastOut,
        status: result.status,
        lateMinutes: result.lateMinutes,
        earlyMinutes: result.earlyMinutes,
        workMinutes: result.workMinutes,
        otMinutes: result.otMinutes,
        locked: true,
        note,
      },
    });
  }

  /** Hook nghỉ phép — Phase 7 sẽ truy vấn ledger. v1 luôn null. */
  private resolveLeave(): Promise<'FULL' | 'HALF' | null> {
    return Promise.resolve(null);
  }

  private localToday(timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  // ===== Cron =====

  /** Đầu mỗi tháng: tạo partition AttendanceLog cho tháng kế tiếp. */
  @Cron('0 0 1 * *')
  async ensureNextPartition(): Promise<void> {
    try {
      await this.prisma.$executeRaw`SELECT create_attendance_partition((CURRENT_DATE + interval '1 month')::date)`;
      this.logger.log('Đã đảm bảo partition AttendanceLog tháng kế tiếp');
    } catch (err) {
      this.logger.error(`Tạo partition thất bại: ${(err as Error).message}`);
    }
  }

  /**
   * 00:30 hàng ngày: đánh ABSENT cho ngày hôm trước với nhân viên có ca,
   * không có log, không nghỉ phép (recalc lại toàn bộ employee active).
   */
  @Cron('30 0 * * *')
  async markAbsentYesterday(): Promise<void> {
    const orgs = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, timezone: true },
    });
    for (const org of orgs) {
      const yesterday = this.localYesterday(org.timezone);
      const employees = await this.prisma.employee.findMany({
        where: { orgId: org.id, status: { not: 'TERMINATED' } },
        select: { id: true },
      });
      for (const emp of employees) {
        try {
          await this.recalc(org.id, emp.id, yesterday);
        } catch (err) {
          this.logger.warn(
            `Recalc ABSENT ${emp.id} ${yesterday} lỗi: ${(err as Error).message}`,
          );
        }
      }
    }
    this.logger.log('Hoàn tất đánh ABSENT ngày hôm trước');
  }

  private localYesterday(timezone: string): string {
    const today = this.localToday(timezone);
    const d = new Date(`${today}T00:00:00Z`);
    return new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10);
  }
}
