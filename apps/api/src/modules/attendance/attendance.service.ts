import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type AttendanceLogResponse,
  type AttendanceSource,
  type AttendanceType,
  type CheckInInput,
  type CreateCorrectionInput,
  type OrgAttendanceQuery,
  type TimesheetDayResponse,
  type TimesheetGridRow,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AttendanceLog } from '../../prisma/prisma.types';
import { TimesheetQueueService } from '../../queues/timesheet.queue';
import { FaceService } from '../face/face.service';
import { EmployeesService } from '../employees/employees.service';
import { haversineMeters } from '../face/face.matching';
import { localDayRangeUtc } from './timesheet.engine';
import { TimesheetService, toTimesheetResponse } from './timesheet.service';

function toLogResponse(log: AttendanceLog): AttendanceLogResponse {
  return {
    id: log.id,
    employeeId: log.employeeId,
    recordedAt: log.recordedAt.toISOString(),
    type: log.type,
    source: log.source,
    worksiteId: log.worksiteId,
    lat: log.lat,
    lng: log.lng,
    accuracy: log.accuracy,
    locationSuspect: log.locationSuspect,
    faceScore: log.faceScore,
    note: log.note,
  };
}

export interface CreateLogInput {
  orgId: string;
  employeeId: string;
  recordedAt: Date;
  type: AttendanceType;
  source: AttendanceSource;
  worksiteId?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  locationSuspect?: boolean;
  faceScore?: number | null;
  photoKey?: string | null;
  deviceId?: string | null;
  note?: string | null;
  createdById?: string | null;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recalcQueue: TimesheetQueueService,
    private readonly employees: EmployeesService,
    private readonly timesheet: TimesheetService,
    private readonly face: FaceService,
  ) {}

  /**
   * Tạo AttendanceLog (idempotent theo unique employeeId+recordedAt+source)
   * rồi đẩy job recalc cho ngày local tương ứng. Dùng chung cho check-in web,
   * face, ingest máy vân tay, correction approved.
   */
  async createLog(input: CreateLogInput): Promise<AttendanceLog> {
    const log = await this.prisma.attendanceLog.create({
      data: {
        orgId: input.orgId,
        employeeId: input.employeeId,
        recordedAt: input.recordedAt,
        type: input.type,
        source: input.source,
        worksiteId: input.worksiteId ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        accuracy: input.accuracy ?? null,
        locationSuspect: input.locationSuspect ?? false,
        faceScore: input.faceScore ?? null,
        photoKey: input.photoKey ?? null,
        deviceId: input.deviceId ?? null,
        note: input.note ?? null,
        createdById: input.createdById ?? null,
      },
    });
    await this.enqueueRecalc(input.orgId, input.employeeId, input.recordedAt);
    return log;
  }

  async enqueueRecalc(
    orgId: string,
    employeeId: string,
    at: Date,
  ): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true },
    });
    const date = this.localDate(at, org?.timezone ?? 'Asia/Ho_Chi_Minh');
    await this.recalcQueue.enqueueRecalc({ orgId, employeeId, date });
  }

  /**
   * Check-in/out: theo worksite của nhân viên, validate geofence (haversine)
   * và/hoặc khuôn mặt (1:1) nếu worksite yêu cầu. Không yêu cầu gì → source WEB.
   */
  async check(
    orgId: string,
    actor: AccessTokenPayload,
    input: CheckInInput,
    photo?: Buffer,
  ): Promise<AttendanceLogResponse> {
    const employee = await this.prisma.employee.findFirst({
      where: { orgId, userId: actor.sub },
      select: { id: true, worksiteId: true, worksite: true },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Tài khoản chưa gắn hồ sơ nhân viên',
        ERROR_CODES.NOT_FOUND,
      );
    }
    const now = new Date();
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { timezone: true },
    });
    const type = input.type ?? (await this.inferType(employee.id, now, org.timezone));
    const worksite = employee.worksite;

    // ===== Geofence =====
    let locationSuspect = false;
    if (worksite?.requireLocation) {
      if (input.lat === undefined || input.lng === undefined) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Cần bật định vị để chấm công tại địa điểm này',
          ERROR_CODES.LOCATION_REQUIRED,
        );
      }
      const dist = haversineMeters(input.lat, input.lng, worksite.lat, worksite.lng);
      if (dist > worksite.radiusM) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          `Bạn đang cách địa điểm làm việc ${Math.round(dist)}m (giới hạn ${worksite.radiusM}m)`,
          ERROR_CODES.OUT_OF_WORKSITE,
          { distance: Math.round(dist), radiusM: worksite.radiusM },
        );
      }
      // Không chống được mock GPS tuyệt đối → flag để HR đối soát
      if (input.accuracy !== undefined && input.accuracy > 200) locationSuspect = true;
    }

    // ===== Face 1:1 =====
    let source: 'FACE' | 'WEB' = 'WEB';
    let faceScore: number | null = null;
    let photoKey: string | null = null;
    if (worksite?.requireFace) {
      if (!photo) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Cần ảnh khuôn mặt để chấm công tại địa điểm này',
          ERROR_CODES.FACE_REQUIRED,
        );
      }
      const result = await this.face.verify(orgId, employee.id, photo);
      source = 'FACE';
      faceScore = result.score;
      photoKey = result.photoKey;
    }

    const log = await this.createLog({
      orgId,
      employeeId: employee.id,
      recordedAt: now,
      type,
      source,
      worksiteId: employee.worksiteId,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      accuracy: input.accuracy ?? null,
      locationSuspect,
      faceScore,
      photoKey,
      note: input.note ?? null,
      createdById: actor.sub,
    });
    addAuditMetadata({ after: { type, source, locationSuspect } });
    return toLogResponse(log);
  }

  /** Log + timesheet của chính mình trong khoảng ngày. */
  async myAttendance(
    orgId: string,
    actor: AccessTokenPayload,
    from: string,
    to: string,
  ): Promise<{ logs: AttendanceLogResponse[]; timesheet: TimesheetDayResponse[] }> {
    const employee = await this.requireOwnEmployee(orgId, actor.sub);
    return this.employeeAttendance(orgId, employee.id, from, to);
  }

  /** Log hôm nay + yêu cầu check-in (face/location) theo worksite — trang /checkin. */
  async myToday(
    orgId: string,
    actor: AccessTokenPayload,
  ): Promise<{
    logs: AttendanceLogResponse[];
    serverTime: string;
    requirement: {
      requireFace: boolean;
      requireLocation: boolean;
      worksiteName: string | null;
      worksiteLat: number | null;
      worksiteLng: number | null;
      radiusM: number | null;
    };
  }> {
    const employee = await this.prisma.employee.findFirst({
      where: { orgId, userId: actor.sub },
      select: { id: true, worksite: true },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Tài khoản chưa gắn hồ sơ nhân viên',
        ERROR_CODES.NOT_FOUND,
      );
    }
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { timezone: true },
    });
    const today = this.localDate(new Date(), org.timezone);
    const { start, end } = localDayRangeUtc(today, org.timezone);
    const logs = await this.prisma.attendanceLog.findMany({
      where: { employeeId: employee.id, recordedAt: { gte: start, lt: end } },
      orderBy: { recordedAt: 'asc' },
    });
    const ws = employee.worksite;
    return {
      logs: logs.map(toLogResponse),
      serverTime: new Date().toISOString(),
      requirement: {
        requireFace: ws?.requireFace ?? false,
        requireLocation: ws?.requireLocation ?? false,
        worksiteName: ws?.name ?? null,
        worksiteLat: ws?.lat ?? null,
        worksiteLng: ws?.lng ?? null,
        radiusM: ws?.radiusM ?? null,
      },
    };
  }

  private async employeeAttendance(
    orgId: string,
    employeeId: string,
    from: string,
    to: string,
  ): Promise<{ logs: AttendanceLogResponse[]; timesheet: TimesheetDayResponse[] }> {
    const startUtc = localDayRangeUtc(from, 'Asia/Ho_Chi_Minh').start;
    const endUtc = localDayRangeUtc(to, 'Asia/Ho_Chi_Minh').end;
    const [logs, timesheet] = await Promise.all([
      this.prisma.attendanceLog.findMany({
        where: { orgId, employeeId, recordedAt: { gte: startUtc, lt: endUtc } },
        orderBy: { recordedAt: 'asc' },
      }),
      this.prisma.timesheetDay.findMany({
        where: {
          orgId,
          employeeId,
          date: { gte: new Date(from), lte: new Date(to) },
        },
        orderBy: { date: 'asc' },
      }),
    ]);
    return {
      logs: logs.map(toLogResponse),
      timesheet: timesheet.map(toTimesheetResponse),
    };
  }

  /** HR/manager xem chấm công 1 nhân viên (scope subtree). */
  async orgAttendance(
    orgId: string,
    actor: AccessTokenPayload,
    query: OrgAttendanceQuery,
  ): Promise<{ logs: AttendanceLogResponse[]; timesheet: TimesheetDayResponse[] }> {
    if (!query.employeeId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Cần employeeId',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    await this.assertInScope(orgId, actor, query.employeeId);
    return this.employeeAttendance(orgId, query.employeeId, query.from, query.to);
  }

  /** Lưới công tháng (employee × ngày) cho AG Grid — scope subtree. */
  async timesheetGrid(
    orgId: string,
    actor: AccessTokenPayload,
    query: OrgAttendanceQuery,
  ): Promise<TimesheetGridRow[]> {
    const scopePaths = await this.employees.resolveScopePaths(actor);
    const where: Prisma.EmployeeWhereInput = {
      orgId,
      status: { not: 'TERMINATED' },
      ...(query.orgUnitId
        ? { orgUnit: { is: { id: query.orgUnitId } } }
        : {}),
      ...(scopePaths
        ? {
            OR: [
              ...scopePaths.map((p) => ({
                orgUnit: { is: { path: { startsWith: p } } },
              })),
              { userId: actor.sub },
            ],
          }
        : {}),
    };
    const employees = await this.prisma.employee.findMany({
      where,
      select: {
        id: true,
        code: true,
        fullName: true,
        orgUnit: { select: { name: true } },
      },
      orderBy: { code: 'asc' },
    });
    const employeeIds = employees.map((e) => e.id);
    if (employeeIds.length === 0) return [];

    const days = await this.prisma.timesheetDay.findMany({
      where: {
        orgId,
        employeeId: { in: employeeIds },
        date: { gte: new Date(query.from), lte: new Date(query.to) },
      },
    });
    const byEmployee = new Map<string, Record<string, TimesheetDayResponse>>();
    for (const d of days) {
      const map = byEmployee.get(d.employeeId) ?? {};
      map[d.date.toISOString().slice(0, 10)] = toTimesheetResponse(d);
      byEmployee.set(d.employeeId, map);
    }

    return employees.map((e) => ({
      employeeId: e.id,
      employeeCode: e.code,
      employeeName: e.fullName,
      orgUnitName: e.orgUnit?.name ?? null,
      days: byEmployee.get(e.id) ?? {},
    }));
  }

  /**
   * Sửa công thủ công — Phase 4 áp dụng trực tiếp (tạo log MANUAL + recalc).
   * Phase 8 sẽ đưa qua Approval engine.
   */
  async createCorrection(
    orgId: string,
    actor: AccessTokenPayload,
    input: CreateCorrectionInput,
  ): Promise<TimesheetDayResponse> {
    await this.assertInScope(orgId, actor, input.employeeId);
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { timezone: true },
    });

    const correction = await this.prisma.attendanceCorrection.create({
      data: {
        orgId,
        employeeId: input.employeeId,
        date: new Date(input.date),
        requestedIn: input.requestedIn
          ? this.localTimeToUtc(input.date, input.requestedIn, org.timezone)
          : null,
        requestedOut: input.requestedOut
          ? this.localTimeToUtc(input.date, input.requestedOut, org.timezone)
          : null,
        reason: input.reason,
        status: 'APPROVED', // Phase 4: áp dụng ngay
        createdById: actor.sub,
      },
    });

    if (correction.requestedIn) {
      await this.createLog({
        orgId,
        employeeId: input.employeeId,
        recordedAt: correction.requestedIn,
        type: 'IN',
        source: 'MANUAL',
        note: `Sửa công: ${input.reason}`,
        createdById: actor.sub,
      });
    }
    if (correction.requestedOut) {
      await this.createLog({
        orgId,
        employeeId: input.employeeId,
        recordedAt: correction.requestedOut,
        type: 'OUT',
        source: 'MANUAL',
        note: `Sửa công: ${input.reason}`,
        createdById: actor.sub,
      });
    }

    addAuditMetadata({
      after: {
        employeeId: input.employeeId,
        date: input.date,
        requestedIn: input.requestedIn,
        requestedOut: input.requestedOut,
        reason: input.reason,
      },
    });

    // recalc đồng bộ để trả timesheet mới nhất ngay (worker queue cũng chạy idempotent)
    await this.timesheet.recalc(orgId, input.employeeId, input.date);
    const updated = await this.prisma.timesheetDay.findUniqueOrThrow({
      where: {
        employeeId_date: {
          employeeId: input.employeeId,
          date: new Date(input.date),
        },
      },
    });
    return toTimesheetResponse(updated);
  }

  // ===== helpers =====

  private async requireOwnEmployee(orgId: string, userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { orgId, userId },
      select: { id: true },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Tài khoản chưa gắn hồ sơ nhân viên',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return employee;
  }

  private async assertInScope(
    orgId: string,
    actor: AccessTokenPayload,
    employeeId: string,
  ): Promise<void> {
    const scopePaths = await this.employees.resolveScopePaths(actor);
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        orgId,
        ...(scopePaths
          ? {
              OR: [
                ...scopePaths.map((p) => ({
                  orgUnit: { is: { path: { startsWith: p } } },
                })),
                { userId: actor.sub },
              ],
            }
          : {}),
      },
      select: { id: true },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy nhân viên trong phạm vi quản lý',
        ERROR_CODES.NOT_FOUND,
      );
    }
  }

  private async inferType(
    employeeId: string,
    now: Date,
    timezone: string,
  ): Promise<AttendanceType> {
    const today = this.localDate(now, timezone);
    const { start, end } = localDayRangeUtc(today, timezone);
    const last = await this.prisma.attendanceLog.findFirst({
      where: { employeeId, recordedAt: { gte: start, lt: end } },
      orderBy: { recordedAt: 'desc' },
    });
    return last?.type === 'IN' ? 'OUT' : 'IN';
  }

  private localDate(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  /** "YYYY-MM-DD" + "HH:mm" giờ local → Date UTC. */
  private localTimeToUtc(dateStr: string, time: string, timezone: string): Date {
    const { start } = localDayRangeUtc(dateStr, timezone);
    const [h, m] = time.split(':').map(Number);
    return new Date(start.getTime() + ((h ?? 0) * 60 + (m ?? 0)) * 60_000);
  }
}
