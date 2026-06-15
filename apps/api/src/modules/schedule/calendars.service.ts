import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateHolidayCalendarInput,
  type CreateHolidayInput,
  type HolidayCalendarResponse,
  type HolidayResponse,
  type UpdateScheduleDefaultsInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';

export interface DayInfo {
  /** Có phải ngày phải đi làm không (lễ nửa ngày vẫn = true). */
  working: boolean;
  dayType: 'WORKING' | 'WEEKEND' | 'HOLIDAY';
  isHalfDay: boolean;
  holidayName: string | null;
}

/** Thứ trong tuần của ngày date-only: 1=Thứ 2 ... 7=Chủ nhật. */
export function weekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=CN
  return day === 0 ? 7 : day;
}

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

@Injectable()
export class CalendarsService {
  constructor(private readonly prisma: PrismaService) {}

  // ===== CRUD calendar/holiday =====

  async list(orgId: string): Promise<HolidayCalendarResponse[]> {
    const calendars = await this.prisma.holidayCalendar.findMany({
      where: { orgId },
      include: { _count: { select: { holidays: true } } },
      orderBy: { name: 'asc' },
    });
    return calendars.map((c) => ({
      id: c.id,
      name: c.name,
      holidayCount: c._count.holidays,
    }));
  }

  async create(
    orgId: string,
    input: CreateHolidayCalendarInput,
  ): Promise<HolidayCalendarResponse> {
    const calendar = await this.prisma.holidayCalendar.create({
      data: { orgId, name: input.name },
    });
    addAuditMetadata({ after: { name: calendar.name } });
    return { id: calendar.id, name: calendar.name, holidayCount: 0 };
  }

  async remove(orgId: string, id: string): Promise<{ message: string }> {
    const calendar = await this.requireCalendar(orgId, id);
    await this.prisma.holidayCalendar.delete({ where: { id } });
    addAuditMetadata({ before: { name: calendar.name } });
    return { message: `Đã xoá lịch ${calendar.name}` };
  }

  async listHolidays(orgId: string, calendarId: string): Promise<HolidayResponse[]> {
    await this.requireCalendar(orgId, calendarId);
    const holidays = await this.prisma.holiday.findMany({
      where: { calendarId },
      orderBy: { date: 'asc' },
    });
    return holidays.map((h) => ({
      id: h.id,
      date: h.date.toISOString().slice(0, 10),
      name: h.name,
      isHalfDay: h.isHalfDay,
    }));
  }

  async addHoliday(
    orgId: string,
    calendarId: string,
    input: CreateHolidayInput,
  ): Promise<HolidayResponse> {
    await this.requireCalendar(orgId, calendarId);
    const existing = await this.prisma.holiday.findUnique({
      where: { calendarId_date: { calendarId, date: new Date(input.date) } },
    });
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        `Ngày ${input.date} đã có trong lịch`,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const holiday = await this.prisma.holiday.create({
      data: {
        calendarId,
        date: new Date(input.date),
        name: input.name,
        isHalfDay: input.isHalfDay,
      },
    });
    addAuditMetadata({ after: { date: input.date, name: input.name } });
    return {
      id: holiday.id,
      date: input.date,
      name: holiday.name,
      isHalfDay: holiday.isHalfDay,
    };
  }

  async removeHoliday(
    orgId: string,
    calendarId: string,
    holidayId: string,
  ): Promise<{ message: string }> {
    await this.requireCalendar(orgId, calendarId);
    const holiday = await this.prisma.holiday.findFirst({
      where: { id: holidayId, calendarId },
    });
    if (!holiday) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy ngày lễ',
        ERROR_CODES.NOT_FOUND,
      );
    }
    await this.prisma.holiday.delete({ where: { id: holidayId } });
    addAuditMetadata({ before: { name: holiday.name } });
    return { message: `Đã xoá ${holiday.name}` };
  }

  // ===== Defaults =====

  async updateOrgDefaults(
    orgId: string,
    input: UpdateScheduleDefaultsInput,
  ): Promise<{ message: string }> {
    if (input.defaultShiftId) {
      await this.requireOwned(this.prisma.workShift, orgId, input.defaultShiftId, 'Ca');
    }
    if (input.defaultCalendarId) {
      await this.requireCalendar(orgId, input.defaultCalendarId);
    }
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(input.defaultShiftId !== undefined
          ? { defaultShiftId: input.defaultShiftId }
          : {}),
        ...(input.defaultCalendarId !== undefined
          ? { defaultCalendarId: input.defaultCalendarId }
          : {}),
      },
    });
    addAuditMetadata({ after: input });
    return { message: 'Đã cập nhật mặc định của tổ chức' };
  }

  async updateUnitDefaults(
    orgId: string,
    unitId: string,
    input: UpdateScheduleDefaultsInput,
  ): Promise<{ message: string }> {
    const unit = await this.prisma.orgUnit.findFirst({
      where: { id: unitId, orgId },
    });
    if (!unit) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy đơn vị',
        ERROR_CODES.NOT_FOUND,
      );
    }
    if (input.defaultShiftId) {
      await this.requireOwned(this.prisma.workShift, orgId, input.defaultShiftId, 'Ca');
    }
    if (input.defaultCalendarId) {
      await this.requireCalendar(orgId, input.defaultCalendarId);
    }
    await this.prisma.orgUnit.update({
      where: { id: unitId },
      data: {
        ...(input.defaultShiftId !== undefined
          ? { defaultShiftId: input.defaultShiftId }
          : {}),
        ...(input.defaultCalendarId !== undefined
          ? { holidayCalendarId: input.defaultCalendarId }
          : {}),
      },
    });
    addAuditMetadata({ after: { unitId, ...input } });
    return { message: `Đã cập nhật mặc định của ${unit.name}` };
  }

  // ===== Resolve =====

  /** Calendar áp dụng: unit chain (gần → xa) → org default → null. */
  async resolveCalendarId(
    orgId: string,
    orgUnitId: string | null,
  ): Promise<string | null> {
    if (orgUnitId) {
      const unit = await this.prisma.orgUnit.findFirst({
        where: { id: orgUnitId, orgId },
        select: { path: true },
      });
      if (unit) {
        const ids = unit.path.split('/').filter(Boolean);
        const units = await this.prisma.orgUnit.findMany({
          where: { id: { in: ids } },
          select: { id: true, holidayCalendarId: true },
        });
        const byId = new Map(units.map((u) => [u.id, u.holidayCalendarId]));
        for (let i = ids.length - 1; i >= 0; i--) {
          const calendarId = byId.get(ids[i]!);
          if (calendarId) return calendarId;
        }
      }
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { defaultCalendarId: true },
    });
    return org?.defaultCalendarId ?? null;
  }

  /**
   * Phân loại 1 ngày cho 1 đơn vị: lễ (cả/nửa ngày) → HOLIDAY;
   * không thuộc workDays (của ca resolve theo cây hoặc Thứ2–6) → WEEKEND;
   * còn lại WORKING. workDaysOverride: truyền workDays của ca đã resolve
   * theo employee (chính xác hơn fallback theo unit).
   */
  async isWorkingDay(
    orgId: string,
    orgUnitId: string | null,
    date: string,
    workDaysOverride?: number[],
  ): Promise<DayInfo> {
    const calendarId = await this.resolveCalendarId(orgId, orgUnitId);
    if (calendarId) {
      const holiday = await this.prisma.holiday.findUnique({
        where: { calendarId_date: { calendarId, date: new Date(date) } },
      });
      if (holiday) {
        return {
          working: holiday.isHalfDay,
          dayType: 'HOLIDAY',
          isHalfDay: holiday.isHalfDay,
          holidayName: holiday.name,
        };
      }
    }

    const workDays = workDaysOverride ?? (await this.resolveWorkDays(orgId, orgUnitId));
    if (!workDays.includes(weekdayOf(date))) {
      return { working: false, dayType: 'WEEKEND', isHalfDay: false, holidayName: null };
    }
    return { working: true, dayType: 'WORKING', isHalfDay: false, holidayName: null };
  }

  private async resolveWorkDays(
    orgId: string,
    orgUnitId: string | null,
  ): Promise<number[]> {
    if (orgUnitId) {
      const unit = await this.prisma.orgUnit.findFirst({
        where: { id: orgUnitId, orgId },
        select: { path: true },
      });
      if (unit) {
        const ids = unit.path.split('/').filter(Boolean);
        const units = await this.prisma.orgUnit.findMany({
          where: { id: { in: ids } },
          select: { id: true, defaultShift: { select: { workDays: true } } },
        });
        const byId = new Map(units.map((u) => [u.id, u.defaultShift?.workDays]));
        for (let i = ids.length - 1; i >= 0; i--) {
          const workDays = byId.get(ids[i]!);
          if (workDays) return workDays;
        }
      }
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { defaultShift: { select: { workDays: true } } },
    });
    return org?.defaultShift?.workDays ?? DEFAULT_WORK_DAYS;
  }

  private async requireCalendar(orgId: string, id: string) {
    const calendar = await this.prisma.holidayCalendar.findFirst({
      where: { id, orgId },
    });
    if (!calendar) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy lịch nghỉ lễ',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return calendar;
  }

  private async requireOwned(
    model: { findFirst: (args: { where: { id: string; orgId: string } }) => Promise<unknown> },
    orgId: string,
    id: string,
    label: string,
  ) {
    const found = await model.findFirst({ where: { id, orgId } });
    if (!found) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        `${label} không tồn tại trong tổ chức`,
        ERROR_CODES.NOT_FOUND,
      );
    }
  }
}
