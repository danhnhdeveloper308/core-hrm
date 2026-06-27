import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateFeedback360Input,
  type CursorPaginated,
  type Feedback360Comment,
  type Feedback360Detail,
  type Feedback360Invitation,
  type Feedback360RelationStat,
  type Feedback360Response,
  type ListFeedback360Query,
  type Rater360Relation,
  type SubmitFeedback360Input,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeesService } from '../employees/employees.service';
import { NotificationService } from '../notification/notification.service';

const RATER_SELECT = {
  id: true,
  relation: true,
  score: true,
  comment: true,
  submitted: true,
  raterEmployeeId: true,
  rater: { select: { fullName: true, userId: true } },
} as const;

const INCLUDE = {
  reviewee: { select: { fullName: true } },
  cycle: { select: { name: true } },
  raters: { select: RATER_SELECT },
} as const;

type Feedback360Row = Prisma.Feedback360GetPayload<{ include: typeof INCLUDE }>;
type RaterRow = Feedback360Row['raters'][number];

const RELATIONS: Rater360Relation[] = [
  'MANAGER',
  'PEER',
  'SUBORDINATE',
  'SELF',
];

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return Math.round((s / nums.length) * 100) / 100;
}

function summary(f: Feedback360Row): Feedback360Response {
  const submitted = f.raters.filter((r) => r.submitted);
  const scores = submitted
    .map((r) => r.score)
    .filter((s): s is number => s !== null);
  return {
    id: f.id,
    revieweeId: f.revieweeId,
    revieweeName: f.reviewee?.fullName ?? null,
    cycleId: f.cycleId,
    cycleName: f.cycle?.name ?? null,
    status: f.status,
    anonymous: f.anonymous,
    raterCount: f.raters.length,
    submittedCount: submitted.length,
    avgScore: avg(scores),
    createdAt: f.createdAt.toISOString(),
  };
}

function detail(f: Feedback360Row): Feedback360Detail {
  const byRelation: Feedback360RelationStat[] = RELATIONS.map((rel) => {
    const group = f.raters.filter((r) => r.relation === rel);
    const sub = group.filter((r) => r.submitted);
    const scores = sub
      .map((r) => r.score)
      .filter((s): s is number => s !== null);
    return {
      relation: rel,
      count: group.length,
      submitted: sub.length,
      avgScore: avg(scores),
    };
  }).filter((s) => s.count > 0);

  // Ẩn danh: KHÔNG lộ tên người đánh giá khi anonymous=true.
  const comments: Feedback360Comment[] = f.raters
    .filter((r): r is RaterRow & { comment: string } =>
      Boolean(r.submitted && r.comment),
    )
    .map((r) => ({
      relation: r.relation,
      comment: r.comment,
      raterName: f.anonymous ? null : (r.rater?.fullName ?? null),
    }));

  return { ...summary(f), byRelation, comments };
}

/**
 * Phản hồi 360°: HR/quản lý lập đợt cho 1 NV + mời người đánh giá; người đánh
 * giá nộp điểm + nhận xét; tổng hợp ẩn danh khi xem.
 */
@Injectable()
export class Feedback360Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
    private readonly notifications: NotificationService,
  ) {}

  async list(
    orgId: string,
    actor: AccessTokenPayload,
    query: ListFeedback360Query,
  ): Promise<CursorPaginated<Feedback360Response>> {
    const empWhere = await this.scopeEmployeeWhere(orgId, actor);
    const where: Prisma.Feedback360WhereInput = {
      orgId,
      ...(query.cycleId ? { cycleId: query.cycleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      reviewee: {
        is: {
          ...empWhere,
          ...(query.revieweeId ? { id: query.revieweeId } : {}),
        },
      },
    };
    const rows = await this.prisma.feedback360.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: items.map(summary),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async get(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
  ): Promise<Feedback360Detail> {
    const f = await this.require(orgId, id);
    await this.assertCanManage(orgId, actor, f.revieweeId);
    return detail(f);
  }

  async create(
    orgId: string,
    actor: AccessTokenPayload,
    input: CreateFeedback360Input,
  ): Promise<Feedback360Response> {
    await this.assertCanManage(orgId, actor, input.revieweeId);
    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: input.cycleId, orgId },
      select: { id: true },
    });
    if (!cycle) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy chu kỳ đánh giá',
        ERROR_CODES.NOT_FOUND,
      );
    }
    // Người đánh giá phải là NV hợp lệ trong org.
    const raterIds = [...new Set(input.raters.map((r) => r.employeeId))];
    const validCount = await this.prisma.employee.count({
      where: { id: { in: raterIds }, orgId, deletedAt: null },
    });
    if (validCount !== raterIds.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Danh sách người đánh giá có nhân viên không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const created = await this.prisma.feedback360
      .create({
        data: {
          orgId,
          revieweeId: input.revieweeId,
          cycleId: input.cycleId,
          anonymous: input.anonymous,
          raters: {
            create: input.raters.map((r) => ({
              orgId,
              raterEmployeeId: r.employeeId,
              relation: r.relation,
            })),
          },
        },
        include: INCLUDE,
      })
      .catch((e: unknown) => {
        if (
          typeof e === 'object' &&
          e !== null &&
          'code' in e &&
          (e as { code?: string }).code === 'P2002'
        ) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'Nhân viên đã có đợt 360° trong chu kỳ này',
            ERROR_CODES.VALIDATION_ERROR,
          );
        }
        throw e;
      });

    await this.notifyRaters(created);
    addAuditMetadata({
      after: {
        revieweeId: input.revieweeId,
        cycleId: input.cycleId,
        raters: raterIds.length,
      },
    });
    return summary(created);
  }

  async close(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
  ): Promise<Feedback360Response> {
    const f = await this.require(orgId, id);
    await this.assertCanManage(orgId, actor, f.revieweeId);
    const updated = await this.prisma.feedback360.update({
      where: { id },
      data: { status: 'CLOSED' },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { status: 'CLOSED' } });
    return summary(updated);
  }

  /** Lời mời 360° của chính tôi (để điền). */
  async myInvitations(
    orgId: string,
    actor: AccessTokenPayload,
  ): Promise<Feedback360Invitation[]> {
    const me = await this.prisma.employee.findFirst({
      where: { userId: actor.sub, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!me) return [];
    const raters = await this.prisma.feedback360Rater.findMany({
      where: { orgId, raterEmployeeId: me.id },
      include: {
        feedback360: {
          select: {
            id: true,
            status: true,
            reviewee: { select: { fullName: true } },
            cycle: { select: { name: true } },
          },
        },
      },
      orderBy: [{ submitted: 'asc' }, { createdAt: 'desc' }],
    });
    return raters.map((r) => ({
      raterId: r.id,
      feedback360Id: r.feedback360Id,
      revieweeName: r.feedback360.reviewee?.fullName ?? null,
      cycleName: r.feedback360.cycle?.name ?? null,
      relation: r.relation,
      status: r.feedback360.status,
      submitted: r.submitted,
      score: r.score,
      comment: r.comment,
    }));
  }

  /** Người đánh giá nộp phản hồi (chỉ phiếu của chính mình, khi đang COLLECTING). */
  async submit(
    orgId: string,
    actor: AccessTokenPayload,
    raterId: string,
    input: SubmitFeedback360Input,
  ): Promise<Feedback360Invitation> {
    const me = await this.prisma.employee.findFirst({
      where: { userId: actor.sub, orgId, deletedAt: null },
      select: { id: true },
    });
    const rater = await this.prisma.feedback360Rater.findFirst({
      where: { id: raterId, orgId },
      include: { feedback360: { select: { status: true } } },
    });
    if (!rater) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy lời mời đánh giá',
        ERROR_CODES.NOT_FOUND,
      );
    }
    if (!me || rater.raterEmployeeId !== me.id) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Chỉ nộp phản hồi của chính mình',
        ERROR_CODES.FORBIDDEN,
      );
    }
    if (rater.feedback360.status !== 'COLLECTING') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Đợt 360° đã đóng',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const updated = await this.prisma.feedback360Rater.update({
      where: { id: raterId },
      data: {
        score: input.score,
        comment: input.comment ?? null,
        submitted: true,
        submittedAt: new Date(),
      },
      include: {
        feedback360: {
          select: {
            id: true,
            status: true,
            reviewee: { select: { fullName: true } },
            cycle: { select: { name: true } },
          },
        },
      },
    });
    addAuditMetadata({ after: { submitted: true } });
    return {
      raterId: updated.id,
      feedback360Id: updated.feedback360Id,
      revieweeName: updated.feedback360.reviewee?.fullName ?? null,
      cycleName: updated.feedback360.cycle?.name ?? null,
      relation: updated.relation,
      status: updated.feedback360.status,
      submitted: updated.submitted,
      score: updated.score,
      comment: updated.comment,
    };
  }

  // ===== helpers =====

  private async require(orgId: string, id: string): Promise<Feedback360Row> {
    const f = await this.prisma.feedback360.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!f) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy đợt 360°',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return f;
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
        'Không có quyền thao tác đợt 360° của nhân viên này',
        ERROR_CODES.FORBIDDEN,
      );
    }
  }

  private async notifyRaters(f: Feedback360Row): Promise<void> {
    const userIds = f.raters
      .map((r) => r.rater?.userId)
      .filter((id): id is string => Boolean(id));
    if (userIds.length === 0) return;
    await this.notifications.dispatch({
      orgId: f.orgId,
      userIds,
      type: 'GENERAL',
      title: 'Phản hồi 360°',
      body: `Bạn được mời đánh giá ${f.reviewee?.fullName ?? 'một đồng nghiệp'}`,
      link: '/dashboard/performance',
    });
  }
}
