import { HttpStatus, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ERROR_CODES,
  type CreateTrainingEnrollmentInput,
  type CursorPaginated,
  type ListTrainingEnrollmentsQuery,
  type TrainingEnrollmentResponse,
  type TrainingEnrollmentStatus,
  type UpdateTrainingEnrollmentInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import {
  APP_EVENTS,
  type ApprovalDecidedEvent,
} from '../../common/events/app.events';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalService } from '../approval/approval.service';
import { EmployeesService } from '../employees/employees.service';
import { NotificationService } from '../notification/notification.service';

const ACTIVE_STATUSES: TrainingEnrollmentStatus[] = [
  'REGISTERED',
  'CONFIRMED',
  'ATTENDED',
  'COMPLETED',
];

const INCLUDE = {
  session: {
    select: {
      title: true,
      startAt: true,
      capacity: true,
      status: true,
      course: { select: { title: true } },
    },
  },
  employee: { select: { fullName: true, userId: true } },
} as const;

type EnrollRow = Prisma.TrainingEnrollmentGetPayload<{ include: typeof INCLUDE }>;

function isNoFlow(err: unknown): boolean {
  if (!(err instanceof AppException)) return false;
  const body = err.getResponse();
  return (
    typeof body === 'object' &&
    body !== null &&
    'errorCode' in body &&
    (body as { errorCode?: string }).errorCode === ERROR_CODES.APPROVAL_NO_FLOW
  );
}

function toResponse(e: EnrollRow): TrainingEnrollmentResponse {
  return {
    id: e.id,
    sessionId: e.sessionId,
    sessionTitle: e.session?.title ?? null,
    courseTitle: e.session?.course?.title ?? null,
    startAt: e.session?.startAt?.toISOString() ?? null,
    employeeId: e.employeeId,
    employeeName: e.employee?.fullName ?? null,
    status: e.status,
    score: e.score,
    feedback: e.feedback,
    createdAt: e.createdAt.toISOString(),
  };
}

/**
 * Đăng ký học. NV tự đăng ký (register) → có thể qua duyệt (TRAINING_ENROLLMENT);
 * không cấu hình luồng → CONFIRMED luôn. HR ghi danh / điểm danh / chấm điểm.
 */
@Injectable()
export class TrainingEnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approval: ApprovalService,
    private readonly employees: EmployeesService,
    private readonly notifications: NotificationService,
  ) {}

  async list(
    orgId: string,
    actor: AccessTokenPayload,
    query: ListTrainingEnrollmentsQuery,
  ): Promise<CursorPaginated<TrainingEnrollmentResponse>> {
    let employeeFilter: Prisma.EmployeeWhereInput;
    if (query.mine) {
      const me = await this.ownEmployeeId(orgId, actor);
      employeeFilter = { id: me };
    } else {
      employeeFilter = await this.scopeEmployeeWhere(orgId, actor);
      if (query.employeeId) employeeFilter = { ...employeeFilter, id: query.employeeId };
    }
    const where: Prisma.TrainingEnrollmentWhereInput = {
      orgId,
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      ...(query.status ? { status: query.status } : {}),
      employee: { is: employeeFilter },
    };
    const rows = await this.prisma.trainingEnrollment.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: items.map(toResponse),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  /** NV tự đăng ký vào lớp. */
  async register(
    orgId: string,
    actor: AccessTokenPayload,
    sessionId: string,
  ): Promise<TrainingEnrollmentResponse> {
    const employeeId = await this.ownEmployeeId(orgId, actor);
    const session = await this.requireOpenSession(orgId, sessionId);
    await this.assertCapacity(orgId, sessionId, session.capacity);
    await this.assertNotEnrolled(sessionId, employeeId);

    const created = await this.prisma.trainingEnrollment.create({
      data: { orgId, sessionId, employeeId, status: 'REGISTERED' },
      include: INCLUDE,
    });

    // Duyệt đăng ký (tuỳ chọn): có luồng → chờ duyệt; không → CONFIRMED luôn.
    let status: 'REGISTERED' | 'CONFIRMED' = 'CONFIRMED';
    try {
      const res = await this.approval.createInstance(
        orgId,
        'TRAINING_ENROLLMENT',
        created.id,
        employeeId,
        {},
        `Đăng ký học ${created.session?.course?.title ?? ''}`.trim(),
      );
      status = res.status === 'APPROVED' ? 'CONFIRMED' : 'REGISTERED';
    } catch (err) {
      if (!isNoFlow(err)) {
        await this.prisma.trainingEnrollment.delete({ where: { id: created.id } });
        throw err;
      }
    }
    const updated = await this.prisma.trainingEnrollment.update({
      where: { id: created.id },
      data: { status },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { sessionId, status } });
    return toResponse(updated);
  }

  /** HR ghi danh hộ 1 NV (xác nhận luôn). */
  async createByHr(
    orgId: string,
    input: CreateTrainingEnrollmentInput,
  ): Promise<TrainingEnrollmentResponse> {
    const session = await this.requireOpenSession(orgId, input.sessionId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Nhân viên không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    await this.assertCapacity(orgId, input.sessionId, session.capacity);
    await this.assertNotEnrolled(input.sessionId, input.employeeId);

    const created = await this.prisma.trainingEnrollment.create({
      data: {
        orgId,
        sessionId: input.sessionId,
        employeeId: input.employeeId,
        status: 'CONFIRMED',
      },
      include: INCLUDE,
    });
    await this.notifyEnrollee(created, 'Bạn được ghi danh vào một lớp đào tạo');
    addAuditMetadata({ after: { sessionId: input.sessionId, employeeId: input.employeeId } });
    return toResponse(created);
  }

  /** HR cập nhật trạng thái / điểm / nhận xét (điểm danh, hoàn thành...). */
  async update(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
    input: UpdateTrainingEnrollmentInput,
  ): Promise<TrainingEnrollmentResponse> {
    const existing = await this.require(orgId, id);
    await this.assertCanManage(orgId, actor, existing.employeeId);
    const updated = await this.prisma.trainingEnrollment.update({
      where: { id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.score !== undefined ? { score: input.score } : {}),
        ...(input.feedback !== undefined ? { feedback: input.feedback } : {}),
      },
      include: INCLUDE,
    });
    if (input.status === 'COMPLETED') {
      await this.notifyEnrollee(updated, 'Bạn đã hoàn thành một khoá đào tạo');
    }
    addAuditMetadata({
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return toResponse(updated);
  }

  /** NV tự huỷ đăng ký của chính mình. */
  async cancel(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
  ): Promise<TrainingEnrollmentResponse> {
    const existing = await this.require(orgId, id);
    const me = await this.ownEmployeeId(orgId, actor);
    const canManage = await this.canManage(orgId, actor, existing.employeeId);
    if (existing.employeeId !== me && !canManage) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Chỉ huỷ đăng ký của chính mình',
        ERROR_CODES.FORBIDDEN,
      );
    }
    if (existing.status === 'COMPLETED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Không thể huỷ đăng ký đã hoàn thành',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    if (existing.status === 'REGISTERED') {
      await this.approval.cancelByTarget(orgId, id);
    }
    const updated = await this.prisma.trainingEnrollment.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: INCLUDE,
    });
    addAuditMetadata({ before: { status: existing.status }, after: { status: 'CANCELLED' } });
    return toResponse(updated);
  }

  @OnEvent(APP_EVENTS.APPROVAL_DECIDED)
  async onApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    if (event.targetType !== 'TRAINING_ENROLLMENT') return;
    const e = await this.prisma.trainingEnrollment.findFirst({
      where: { id: event.targetId, orgId: event.orgId },
      select: { id: true, status: true },
    });
    if (!e || e.status !== 'REGISTERED') return;
    const updated = await this.prisma.trainingEnrollment.update({
      where: { id: e.id },
      data: { status: event.status === 'APPROVED' ? 'CONFIRMED' : 'CANCELLED' },
      include: INCLUDE,
    });
    await this.notifyEnrollee(
      updated,
      event.status === 'APPROVED'
        ? 'Đăng ký học của bạn đã được duyệt'
        : 'Đăng ký học của bạn bị từ chối',
    );
  }

  // ===== helpers =====

  private async require(orgId: string, id: string): Promise<EnrollRow> {
    const e = await this.prisma.trainingEnrollment.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!e) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy đăng ký học',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return e;
  }

  private async requireOpenSession(
    orgId: string,
    sessionId: string,
  ): Promise<{ capacity: number | null }> {
    const s = await this.prisma.trainingSession.findFirst({
      where: { id: sessionId, orgId },
      select: { id: true, capacity: true, status: true },
    });
    if (!s) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy lớp đào tạo',
        ERROR_CODES.NOT_FOUND,
      );
    }
    if (s.status === 'CANCELLED' || s.status === 'DONE') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Lớp đã đóng / đã kết thúc — không thể đăng ký',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    return { capacity: s.capacity };
  }

  private async assertCapacity(
    orgId: string,
    sessionId: string,
    capacity: number | null,
  ): Promise<void> {
    if (capacity === null) return;
    const count = await this.prisma.trainingEnrollment.count({
      where: { orgId, sessionId, status: { in: ACTIVE_STATUSES } },
    });
    if (count >= capacity) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Lớp đã đủ sĩ số',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
  }

  private async assertNotEnrolled(
    sessionId: string,
    employeeId: string,
  ): Promise<void> {
    const existing = await this.prisma.trainingEnrollment.findFirst({
      where: {
        sessionId,
        employeeId,
        status: { in: ACTIVE_STATUSES },
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Đã đăng ký lớp này rồi',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
  }

  private async ownEmployeeId(
    orgId: string,
    actor: AccessTokenPayload,
  ): Promise<string> {
    const e = await this.prisma.employee.findFirst({
      where: { userId: actor.sub, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!e) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Tài khoản chưa gắn hồ sơ nhân viên — không thể đăng ký học',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    return e.id;
  }

  private async scopeEmployeeWhere(
    orgId: string,
    actor: AccessTokenPayload,
  ): Promise<Prisma.EmployeeWhereInput> {
    const paths = await this.employees.resolveScopePaths(actor);
    if (paths === null) return { orgId, deletedAt: null };
    return {
      orgId,
      deletedAt: null,
      OR: [
        ...paths.map((p) => ({
          orgUnit: { is: { path: { startsWith: p } } },
        })),
        { userId: actor.sub },
      ],
    };
  }

  private async canManage(
    orgId: string,
    actor: AccessTokenPayload,
    employeeId: string,
  ): Promise<boolean> {
    const where = await this.scopeEmployeeWhere(orgId, actor);
    const found = await this.prisma.employee.findFirst({
      where: { ...where, id: employeeId },
      select: { id: true },
    });
    return Boolean(found);
  }

  private async assertCanManage(
    orgId: string,
    actor: AccessTokenPayload,
    employeeId: string,
  ): Promise<void> {
    if (!(await this.canManage(orgId, actor, employeeId))) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Không có quyền thao tác đăng ký của nhân viên này',
        ERROR_CODES.FORBIDDEN,
      );
    }
  }

  private async notifyEnrollee(e: EnrollRow, body: string): Promise<void> {
    const userId = e.employee?.userId;
    if (!userId) return;
    await this.notifications.dispatch({
      orgId: e.orgId,
      userIds: [userId],
      type: 'GENERAL',
      title: 'Đào tạo',
      body,
      link: '/dashboard/training',
    });
  }
}
