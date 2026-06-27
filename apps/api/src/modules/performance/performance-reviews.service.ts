import { HttpStatus, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ERROR_CODES,
  type CreatePerformanceReviewInput,
  type CursorPaginated,
  type GenerateReviewsInput,
  type ListPerformanceReviewsQuery,
  type PerformanceReviewResponse,
  type SubmitManagerReviewInput,
  type SubmitSelfReviewInput,
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

const INCLUDE = {
  employee: { select: { fullName: true, userId: true } },
  reviewer: { select: { fullName: true, userId: true } },
  cycle: { select: { name: true } },
} as const;

type ReviewRow = Prisma.PerformanceReviewGetPayload<{ include: typeof INCLUDE }>;

/** Lỗi "chưa cấu hình luồng duyệt" từ engine (ký duyệt là tuỳ chọn). */
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

function toResponse(r: ReviewRow): PerformanceReviewResponse {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employee?.fullName ?? null,
    cycleId: r.cycleId,
    cycleName: r.cycle?.name ?? null,
    reviewerId: r.reviewerId,
    reviewerName: r.reviewer?.fullName ?? null,
    selfScore: r.selfScore,
    selfComment: r.selfComment,
    managerScore: r.managerScore,
    managerComment: r.managerComment,
    finalScore: r.finalScore,
    ratingLabel: r.ratingLabel,
    status: r.status,
    submittedSelfAt: r.submittedSelfAt?.toISOString() ?? null,
    submittedManagerAt: r.submittedManagerAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Đánh giá hiệu suất: SELF (NV tự đánh giá) → MANAGER (quản lý chấm) →
 * CALIBRATION (chờ ký duyệt qua engine PERFORMANCE_REVIEW) → DONE.
 * Không cấu hình luồng duyệt → ký duyệt bỏ qua, chốt DONE luôn.
 */
@Injectable()
export class PerformanceReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approval: ApprovalService,
    private readonly employees: EmployeesService,
    private readonly notifications: NotificationService,
  ) {}

  async list(
    orgId: string,
    actor: AccessTokenPayload,
    query: ListPerformanceReviewsQuery,
  ): Promise<CursorPaginated<PerformanceReviewResponse>> {
    const empWhere = await this.scopeEmployeeWhere(orgId, actor);
    const where: Prisma.PerformanceReviewWhereInput = {
      orgId,
      ...(query.cycleId ? { cycleId: query.cycleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      employee: {
        is: {
          ...empWhere,
          ...(query.employeeId ? { id: query.employeeId } : {}),
        },
      },
    };
    const rows = await this.prisma.performanceReview.findMany({
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

  async get(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
  ): Promise<PerformanceReviewResponse> {
    const r = await this.require(orgId, id);
    await this.assertCanView(orgId, actor, r);
    return toResponse(r);
  }

  /** HR tạo 1 phiếu đánh giá (gán NV + người đánh giá). */
  async create(
    orgId: string,
    input: CreatePerformanceReviewInput,
  ): Promise<PerformanceReviewResponse> {
    await this.assertCycle(orgId, input.cycleId);
    const employee = await this.assertEmployee(orgId, input.employeeId);
    const reviewerId =
      input.reviewerId ?? employee.managerId ?? null;
    const created = await this.prisma.performanceReview
      .create({
        data: {
          orgId,
          employeeId: input.employeeId,
          cycleId: input.cycleId,
          reviewerId,
        },
        include: INCLUDE,
      })
      .catch((e: unknown) => {
        throw this.uniqueOrThrow(e);
      });
    await this.notifyEmployee(created, 'Bạn có phiếu tự đánh giá cần hoàn thành');
    addAuditMetadata({
      after: { employeeId: input.employeeId, cycleId: input.cycleId },
    });
    return toResponse(created);
  }

  /** HR sinh hàng loạt: mỗi NV đang ACTIVE chưa có phiếu trong chu kỳ → tạo. */
  async generate(
    orgId: string,
    input: GenerateReviewsInput,
  ): Promise<{ created: number }> {
    await this.assertCycle(orgId, input.cycleId);
    const employees = await this.prisma.employee.findMany({
      where: { orgId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, managerId: true },
    });
    const existing = await this.prisma.performanceReview.findMany({
      where: { orgId, cycleId: input.cycleId },
      select: { employeeId: true },
    });
    const have = new Set(existing.map((e) => e.employeeId));
    const toCreate = employees.filter((e) => !have.has(e.id));
    if (toCreate.length > 0) {
      await this.prisma.performanceReview.createMany({
        data: toCreate.map((e) => ({
          orgId,
          employeeId: e.id,
          cycleId: input.cycleId,
          reviewerId: e.managerId,
        })),
        skipDuplicates: true,
      });
    }
    addAuditMetadata({
      after: { cycleId: input.cycleId, created: toCreate.length },
    });
    return { created: toCreate.length };
  }

  /** NV tự đánh giá (chỉ phiếu của chính mình, khi đang ở bước SELF). */
  async submitSelf(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
    input: SubmitSelfReviewInput,
  ): Promise<PerformanceReviewResponse> {
    const review = await this.require(orgId, id);
    const own = await this.ownEmployeeId(orgId, actor);
    if (review.employeeId !== own) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Chỉ tự đánh giá phiếu của chính mình',
        ERROR_CODES.FORBIDDEN,
      );
    }
    if (review.status !== 'SELF') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Phiếu đã qua bước tự đánh giá',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const updated = await this.prisma.performanceReview.update({
      where: { id },
      data: {
        selfScore: input.selfScore,
        selfComment: input.selfComment ?? null,
        status: 'MANAGER',
        submittedSelfAt: new Date(),
      },
      include: INCLUDE,
    });
    await this.notifyReviewer(updated, 'Có phiếu cần bạn đánh giá (quản lý)');
    addAuditMetadata({ after: { status: 'MANAGER', selfScore: input.selfScore } });
    return toResponse(updated);
  }

  /** Quản lý chấm điểm + chốt → ký duyệt (nếu có luồng) hoặc DONE luôn. */
  async submitManager(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
    input: SubmitManagerReviewInput,
  ): Promise<PerformanceReviewResponse> {
    const review = await this.require(orgId, id);
    await this.assertCanManage(orgId, actor, review.employeeId);
    if (review.status !== 'MANAGER') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Phiếu không ở bước quản lý đánh giá',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const reviewer = await this.ownEmployeeId(orgId, actor);

    // Lưu điểm quản lý trước; trạng thái phụ thuộc kết quả tạo phiếu ký duyệt.
    await this.prisma.performanceReview.update({
      where: { id },
      data: {
        reviewerId: reviewer,
        managerScore: input.managerScore,
        managerComment: input.managerComment ?? null,
        finalScore: input.finalScore,
        ratingLabel: input.ratingLabel ?? null,
        submittedManagerAt: new Date(),
      },
    });

    let nextStatus: 'CALIBRATION' | 'DONE' = 'DONE';
    try {
      const res = await this.approval.createInstance(
        orgId,
        'PERFORMANCE_REVIEW',
        id,
        reviewer,
        { finalScore: input.finalScore },
        `Ký duyệt đánh giá ${review.employee?.fullName ?? ''}`.trim(),
      );
      nextStatus = res.status === 'APPROVED' ? 'DONE' : 'CALIBRATION';
    } catch (err) {
      // Chưa cấu hình luồng ký duyệt → chốt DONE luôn (ký duyệt là tuỳ chọn).
      if (!isNoFlow(err)) throw err;
    }

    const updated = await this.prisma.performanceReview.update({
      where: { id },
      data: { status: nextStatus },
      include: INCLUDE,
    });
    if (nextStatus === 'DONE') {
      await this.notifyEmployee(updated, 'Đánh giá hiệu suất của bạn đã hoàn tất');
    }
    addAuditMetadata({
      after: { status: nextStatus, finalScore: input.finalScore },
    });
    return toResponse(updated);
  }

  /** Áp kết quả ký duyệt PERFORMANCE_REVIEW. */
  @OnEvent(APP_EVENTS.APPROVAL_DECIDED)
  async onApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    if (event.targetType !== 'PERFORMANCE_REVIEW') return;
    const review = await this.prisma.performanceReview.findFirst({
      where: { id: event.targetId, orgId: event.orgId },
      select: { id: true, status: true },
    });
    if (!review || review.status !== 'CALIBRATION') return;
    const updated = await this.prisma.performanceReview.update({
      where: { id: review.id },
      data: { status: event.status === 'APPROVED' ? 'DONE' : 'MANAGER' },
      include: INCLUDE,
    });
    if (event.status === 'APPROVED') {
      await this.notifyEmployee(updated, 'Đánh giá hiệu suất của bạn đã hoàn tất');
    }
  }

  // ===== helpers =====

  private async require(orgId: string, id: string): Promise<ReviewRow> {
    const r = await this.prisma.performanceReview.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!r) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy phiếu đánh giá',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return r;
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
        'Tài khoản chưa gắn hồ sơ nhân viên',
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

  private async assertCanManage(
    orgId: string,
    actor: AccessTokenPayload,
    employeeId: string,
  ): Promise<void> {
    const where = await this.scopeEmployeeWhere(orgId, actor);
    const found = await this.prisma.employee.findFirst({
      where: { ...where, id: employeeId },
      select: { id: true },
    });
    if (!found) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Không có quyền thao tác phiếu đánh giá của nhân viên này',
        ERROR_CODES.FORBIDDEN,
      );
    }
  }

  /** Xem được: trong phạm vi (bản thân/subtree/HR). */
  private async assertCanView(
    orgId: string,
    actor: AccessTokenPayload,
    review: ReviewRow,
  ): Promise<void> {
    await this.assertCanManage(orgId, actor, review.employeeId);
  }

  private async assertCycle(orgId: string, cycleId: string): Promise<void> {
    const c = await this.prisma.reviewCycle.findFirst({
      where: { id: cycleId, orgId },
      select: { id: true },
    });
    if (!c) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy chu kỳ đánh giá',
        ERROR_CODES.NOT_FOUND,
      );
    }
  }

  private async assertEmployee(
    orgId: string,
    employeeId: string,
  ): Promise<{ id: string; managerId: string | null }> {
    const e = await this.prisma.employee.findFirst({
      where: { id: employeeId, orgId, deletedAt: null },
      select: { id: true, managerId: true },
    });
    if (!e) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Nhân viên không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    return e;
  }

  private uniqueOrThrow(e: unknown): AppException {
    if (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      (e as { code?: string }).code === 'P2002'
    ) {
      return new AppException(
        HttpStatus.CONFLICT,
        'Nhân viên đã có phiếu đánh giá trong chu kỳ này',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    return e instanceof AppException
      ? e
      : new AppException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Lỗi tạo phiếu đánh giá',
          ERROR_CODES.INTERNAL_ERROR,
        );
  }

  private async notifyEmployee(r: ReviewRow, body: string): Promise<void> {
    const userId = r.employee?.userId;
    if (!userId) return;
    await this.notifications.dispatch({
      orgId: r.orgId,
      userIds: [userId],
      type: 'GENERAL',
      title: 'Đánh giá hiệu suất',
      body,
      link: '/dashboard/performance',
    });
  }

  private async notifyReviewer(r: ReviewRow, body: string): Promise<void> {
    const userId = r.reviewer?.userId;
    if (!userId) return;
    await this.notifications.dispatch({
      orgId: r.orgId,
      userIds: [userId],
      type: 'GENERAL',
      title: 'Đánh giá hiệu suất',
      body,
      link: '/dashboard/performance',
    });
  }
}
