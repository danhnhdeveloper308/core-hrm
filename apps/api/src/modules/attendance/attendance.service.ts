import { HttpStatus, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ERROR_CODES,
  type AttendanceLogResponse,
  type AttendanceSource,
  type AttendanceType,
  type CheckInInput,
  type CorrectionRequestResponse,
  type CreateCorrectionInput,
  type CreateOtRequestInput,
  type OrgAttendanceQuery,
  type OtRequestResponse,
  type RequestCorrectionInput,
  type TimesheetDayResponse,
  type TimesheetGridResponse,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import {
  APP_EVENTS,
  type ApprovalDecidedEvent,
} from '../../common/events/app.events';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AttendanceLog } from '../../prisma/prisma.types';
import { TimesheetQueueService } from '../../queues/timesheet.queue';
import { ApprovalService } from '../approval/approval.service';
import { FaceService } from '../face/face.service';
import { EmployeesService } from '../employees/employees.service';
import { CalendarsService } from '../schedule/calendars.service';
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
    private readonly approval: ApprovalService,
    private readonly calendars: CalendarsService,
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
  ): Promise<TimesheetGridResponse> {
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
    // Ngày nghỉ theo CẤU HÌNH ca (workDays của ca mặc định org/đơn vị đang xem),
    // chuyển sang quy ước Date.getUTCDay() (0=CN..6=T7) để FE tô xám đúng.
    const workDays = await this.calendars.resolveWorkDays(
      orgId,
      query.orgUnitId ?? null,
    );
    const restWeekdays = [0, 1, 2, 3, 4, 5, 6].filter((jsDay) => {
      const iso = jsDay === 0 ? 7 : jsDay; // workDays dùng 1=T2..7=CN
      return !workDays.includes(iso);
    });

    const employeeIds = employees.map((e) => e.id);
    if (employeeIds.length === 0) return { restWeekdays, rows: [] };

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

    const rows = employees.map((e) => ({
      employeeId: e.id,
      employeeCode: e.code,
      employeeName: e.fullName,
      orgUnitName: e.orgUnit?.name ?? null,
      days: byEmployee.get(e.id) ?? {},
    }));
    return { restWeekdays, rows };
  }

  /** HR tính lại 1 ngày từ log gốc (gỡ kẹt dữ liệu cũ). */
  async recalcDay(
    orgId: string,
    actor: AccessTokenPayload,
    employeeId: string,
    date: string,
  ): Promise<TimesheetDayResponse | null> {
    await this.assertInScope(orgId, actor, employeeId);
    await this.timesheet.recalc(orgId, employeeId, date);
    addAuditMetadata({ after: { employeeId, date, action: 'recalc' } });
    return this.findTimesheet(orgId, employeeId, date);
  }

  /** HR reset (xóa) công 1 ngày: xóa log + timesheet, tính lại từ 0. */
  async resetDay(
    orgId: string,
    actor: AccessTokenPayload,
    employeeId: string,
    date: string,
  ): Promise<TimesheetDayResponse | null> {
    await this.assertInScope(orgId, actor, employeeId);
    await this.timesheet.resetDay(orgId, employeeId, date);
    addAuditMetadata({ after: { employeeId, date, action: 'reset' } });
    return this.findTimesheet(orgId, employeeId, date);
  }

  /** HR sửa giờ công thủ công + khóa ngày (recalc tự động không ghi đè). */
  async editTimesheet(
    orgId: string,
    actor: AccessTokenPayload,
    input: {
      employeeId: string;
      date: string;
      firstIn: string;
      lastOut?: string | null;
      note?: string | null;
    },
  ): Promise<TimesheetDayResponse> {
    await this.assertInScope(orgId, actor, input.employeeId);
    await this.timesheet.applyEdit(
      orgId,
      input.employeeId,
      input.date,
      input.firstIn,
      input.lastOut ?? null,
      input.note ?? null,
    );
    addAuditMetadata({
      after: {
        employeeId: input.employeeId,
        date: input.date,
        firstIn: input.firstIn,
        lastOut: input.lastOut,
        action: 'manual_edit',
      },
    });
    const result = await this.findTimesheet(orgId, input.employeeId, input.date);
    if (!result) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Không tìm thấy bảng công sau khi sửa',
        ERROR_CODES.INTERNAL_ERROR,
      );
    }
    return result;
  }

  private async findTimesheet(
    orgId: string,
    employeeId: string,
    date: string,
  ): Promise<TimesheetDayResponse | null> {
    const row = await this.prisma.timesheetDay.findFirst({
      where: { orgId, employeeId, date: new Date(date) },
    });
    return row ? toTimesheetResponse(row) : null;
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

    await this.applyCorrection(correction, actor.sub);

    addAuditMetadata({
      after: {
        employeeId: input.employeeId,
        date: input.date,
        requestedIn: input.requestedIn,
        requestedOut: input.requestedOut,
        reason: input.reason,
      },
    });

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

  /**
   * Áp 1 correction vào bảng công: tạo log IN/OUT thủ công rồi recalc ngày đó.
   * Dùng chung cho HR sửa trực tiếp và correction được DUYỆT qua luồng.
   */
  private async applyCorrection(
    correction: {
      orgId: string;
      employeeId: string;
      date: Date;
      requestedIn: Date | null;
      requestedOut: Date | null;
      reason: string;
    },
    actorId: string | null,
  ): Promise<void> {
    if (correction.requestedIn) {
      await this.createLog({
        orgId: correction.orgId,
        employeeId: correction.employeeId,
        recordedAt: correction.requestedIn,
        type: 'IN',
        source: 'MANUAL',
        note: `Sửa công: ${correction.reason}`,
        createdById: actorId,
      });
    }
    if (correction.requestedOut) {
      await this.createLog({
        orgId: correction.orgId,
        employeeId: correction.employeeId,
        recordedAt: correction.requestedOut,
        type: 'OUT',
        source: 'MANUAL',
        note: `Sửa công: ${correction.reason}`,
        createdById: actorId,
      });
    }
    // recalc đồng bộ (worker queue cũng chạy idempotent)
    await this.timesheet.recalc(
      correction.orgId,
      correction.employeeId,
      correction.date.toISOString().slice(0, 10),
    );
  }

  /**
   * Nhân viên TỰ xin sửa công → tạo correction PENDING + luồng duyệt. Áp dụng
   * bảng công chỉ khi được DUYỆT (onApprovalDecided). Trả id để đính kèm file.
   */
  async requestCorrection(
    orgId: string,
    actor: AccessTokenPayload,
    input: RequestCorrectionInput,
  ): Promise<{ id: string }> {
    const employee = await this.requireOwnEmployee(orgId, actor.sub);
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { timezone: true },
    });
    const correction = await this.prisma.attendanceCorrection.create({
      data: {
        orgId,
        employeeId: employee.id,
        date: new Date(input.date),
        requestedIn: input.requestedIn
          ? this.localTimeToUtc(input.date, input.requestedIn, org.timezone)
          : null,
        requestedOut: input.requestedOut
          ? this.localTimeToUtc(input.date, input.requestedOut, org.timezone)
          : null,
        reason: input.reason,
        status: 'PENDING',
        createdById: actor.sub,
      },
    });
    const parts = [
      input.requestedIn ? `vào ${input.requestedIn}` : null,
      input.requestedOut ? `ra ${input.requestedOut}` : null,
    ].filter(Boolean);
    await this.approval.createInstance(
      orgId,
      'ATTENDANCE_CORRECTION',
      correction.id,
      employee.id,
      {},
      `Sửa công ${input.date}: ${parts.join(', ')}`,
    );
    addAuditMetadata({ after: { date: input.date, reason: input.reason } });
    return { id: correction.id };
  }

  /** Danh sách đơn sửa công của chính actor. */
  async listMyCorrections(
    orgId: string,
    userId: string,
  ): Promise<CorrectionRequestResponse[]> {
    const employee = await this.requireOwnEmployee(orgId, userId);
    const rows = await this.prisma.attendanceCorrection.findMany({
      where: { orgId, employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((c) => ({
      id: c.id,
      date: c.date.toISOString(),
      requestedIn: c.requestedIn?.toISOString() ?? null,
      requestedOut: c.requestedOut?.toISOString() ?? null,
      reason: c.reason,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  /** Correction được duyệt/từ chối → áp bảng công hoặc đánh dấu từ chối. */
  @OnEvent(APP_EVENTS.APPROVAL_DECIDED)
  async onCorrectionDecided(event: ApprovalDecidedEvent): Promise<void> {
    if (event.targetType !== 'ATTENDANCE_CORRECTION') return;
    const correction = await this.prisma.attendanceCorrection.findFirst({
      where: { id: event.targetId, orgId: event.orgId },
    });
    if (!correction || correction.status !== 'PENDING') return;

    if (event.status === 'REJECTED') {
      await this.prisma.attendanceCorrection.update({
        where: { id: correction.id },
        data: { status: 'REJECTED' },
      });
      return;
    }
    await this.prisma.attendanceCorrection.update({
      where: { id: correction.id },
      data: { status: 'APPROVED' },
    });
    await this.applyCorrection(correction, correction.createdById);
  }

  // ===== Tăng ca / dời giờ (OT) =====

  /** Nhân viên đăng ký tăng ca / dời giờ → đơn PENDING + luồng duyệt OT. */
  async requestOt(
    orgId: string,
    actor: AccessTokenPayload,
    input: CreateOtRequestInput,
  ): Promise<{ id: string }> {
    const employee = await this.requireOwnEmployee(orgId, actor.sub);
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { timezone: true },
    });
    const ot = await this.prisma.otRequest.create({
      data: {
        orgId,
        employeeId: employee.id,
        date: new Date(input.date),
        type: input.type,
        startTime: this.localTimeToUtc(input.date, input.startTime, org.timezone),
        endTime: this.localTimeToUtc(input.date, input.endTime, org.timezone),
        reason: input.reason,
        status: 'PENDING',
        createdById: actor.sub,
      },
    });
    const label =
      input.type === 'OVERTIME'
        ? `Tăng ca ${input.date}: ${input.startTime}–${input.endTime}`
        : `Dời giờ ${input.date}: vào ${input.startTime}, ra ${input.endTime}`;
    await this.approval.createInstance(orgId, 'OT', ot.id, employee.id, {}, label);
    addAuditMetadata({ after: { type: input.type, date: input.date } });
    return { id: ot.id };
  }

  async listMyOt(orgId: string, userId: string): Promise<OtRequestResponse[]> {
    const employee = await this.requireOwnEmployee(orgId, userId);
    const rows = await this.prisma.otRequest.findMany({
      where: { orgId, employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((o) => ({
      id: o.id,
      type: o.type,
      date: o.date.toISOString(),
      startTime: o.startTime.toISOString(),
      endTime: o.endTime.toISOString(),
      reason: o.reason,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  /** Đơn OT được duyệt → cộng giờ OT hoặc tính lại theo khung giờ mới. */
  @OnEvent(APP_EVENTS.APPROVAL_DECIDED)
  async onOtDecided(event: ApprovalDecidedEvent): Promise<void> {
    if (event.targetType !== 'OT') return;
    const ot = await this.prisma.otRequest.findFirst({
      where: { id: event.targetId, orgId: event.orgId },
    });
    if (!ot || ot.status !== 'PENDING') return;

    if (event.status === 'REJECTED') {
      await this.prisma.otRequest.update({
        where: { id: ot.id },
        data: { status: 'REJECTED' },
      });
      return;
    }
    await this.prisma.otRequest.update({
      where: { id: ot.id },
      data: { status: 'APPROVED' },
    });

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: ot.orgId },
      select: { timezone: true },
    });
    const dateStr = ot.date.toISOString().slice(0, 10);
    const toLocalHhmm = (d: Date) =>
      d.toLocaleTimeString('en-GB', {
        timeZone: org.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

    if (ot.type === 'OVERTIME') {
      const minutes = Math.round((ot.endTime.getTime() - ot.startTime.getTime()) / 60_000);
      await this.timesheet.applyApprovedOt(
        ot.orgId,
        ot.employeeId,
        dateStr,
        minutes,
        `OT duyệt: ${toLocalHhmm(ot.startTime)}–${toLocalHhmm(ot.endTime)}`,
      );
    } else {
      await this.timesheet.applyShiftAdjustment(
        ot.orgId,
        ot.employeeId,
        dateStr,
        toLocalHhmm(ot.startTime),
        toLocalHhmm(ot.endTime),
        `Dời giờ duyệt: ${toLocalHhmm(ot.startTime)}–${toLocalHhmm(ot.endTime)}`,
      );
    }
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
