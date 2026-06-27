import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateInterviewInput,
  type CursorPaginated,
  type InterviewFeedbackResponse,
  type InterviewResponse,
  type ListInterviewsQuery,
  type SubmitFeedbackInput,
  type UpdateInterviewInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

const INCLUDE = {
  application: {
    select: {
      candidate: { select: { fullName: true } },
      jobRequisition: { select: { title: true } },
    },
  },
  panelists: { include: { employee: { select: { fullName: true } } } },
  _count: { select: { feedbacks: true } },
} as const;

type InterviewWithRels = Prisma.InterviewGetPayload<{ include: typeof INCLUDE }>;

function toResponse(i: InterviewWithRels): InterviewResponse {
  return {
    id: i.id,
    applicationId: i.applicationId,
    candidateName: i.application.candidate.fullName,
    jobTitle: i.application.jobRequisition?.title ?? null,
    round: i.round,
    mode: i.mode,
    scheduledAt: i.scheduledAt.toISOString(),
    durationMin: i.durationMin,
    location: i.location,
    meetingLink: i.meetingLink,
    status: i.status,
    panelists: i.panelists.map((p) => ({
      employeeId: p.employeeId,
      employeeName: p.employee.fullName,
    })),
    feedbackCount: i._count.feedbacks,
    createdAt: i.createdAt.toISOString(),
  };
}

type FeedbackWithAuthor = Prisma.InterviewFeedbackGetPayload<{
  include: { interviewer: { select: { fullName: true } } };
}>;

function toFeedback(f: FeedbackWithAuthor): InterviewFeedbackResponse {
  return {
    id: f.id,
    interviewId: f.interviewId,
    interviewerId: f.interviewerId,
    interviewerName: f.interviewer?.fullName ?? null,
    score: f.score,
    recommendation: f.recommendation,
    comment: f.comment,
    createdAt: f.createdAt.toISOString(),
  };
}

/** Phỏng vấn: lịch + hội đồng + scorecard. Báo panelist khi lên lịch. */
@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async list(
    orgId: string,
    query: ListInterviewsQuery,
  ): Promise<CursorPaginated<InterviewResponse>> {
    const where: Prisma.InterviewWhereInput = {
      orgId,
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const rows = await this.prisma.interview.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
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

  async create(
    orgId: string,
    input: CreateInterviewInput,
  ): Promise<InterviewResponse> {
    const app = await this.prisma.application.findFirst({
      where: { id: input.applicationId, orgId },
      select: { id: true, stage: true },
    });
    if (!app) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy hồ sơ ứng tuyển',
        ERROR_CODES.NOT_FOUND,
      );
    }
    const panelistIds = await this.validPanelists(orgId, input.panelistEmployeeIds);
    const scheduledAt = this.parseDate(input.scheduledAt);

    const created = await this.prisma.interview.create({
      data: {
        orgId,
        applicationId: input.applicationId,
        round: input.round,
        mode: input.mode,
        scheduledAt,
        durationMin: input.durationMin,
        location: input.location ?? null,
        meetingLink: input.meetingLink ?? null,
        panelists: { create: panelistIds.map((employeeId) => ({ employeeId })) },
      },
      include: INCLUDE,
    });

    // Đẩy hồ sơ sang stage INTERVIEW nếu còn ở giai đoạn đầu.
    if (app.stage === 'APPLIED' || app.stage === 'SCREENING') {
      await this.prisma.application.update({
        where: { id: app.id },
        data: { stage: 'INTERVIEW' },
      });
    }
    await this.notifyPanelists(orgId, created);
    addAuditMetadata({ after: { applicationId: input.applicationId, round: input.round } });
    return toResponse(created);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateInterviewInput,
  ): Promise<InterviewResponse> {
    await this.require(orgId, id);
    const data: Prisma.InterviewUpdateInput = {};
    if (input.round !== undefined) data.round = input.round;
    if (input.mode !== undefined) data.mode = input.mode;
    if (input.durationMin !== undefined) data.durationMin = input.durationMin;
    if (input.location !== undefined) data.location = input.location;
    if (input.meetingLink !== undefined) data.meetingLink = input.meetingLink;
    if (input.status !== undefined) data.status = input.status;
    if (input.scheduledAt !== undefined) data.scheduledAt = this.parseDate(input.scheduledAt);

    if (input.panelistEmployeeIds !== undefined) {
      const panelistIds = await this.validPanelists(orgId, input.panelistEmployeeIds);
      await this.prisma.$transaction([
        this.prisma.interviewPanelist.deleteMany({ where: { interviewId: id } }),
        this.prisma.interviewPanelist.createMany({
          data: panelistIds.map((employeeId) => ({ interviewId: id, employeeId })),
        }),
      ]);
    }

    const updated = await this.prisma.interview.update({
      where: { id },
      data,
      include: INCLUDE,
    });
    addAuditMetadata({ after: { status: updated.status } });
    return toResponse(updated);
  }

  async listFeedback(
    orgId: string,
    interviewId: string,
  ): Promise<InterviewFeedbackResponse[]> {
    await this.require(orgId, interviewId);
    const rows = await this.prisma.interviewFeedback.findMany({
      where: { interviewId, orgId },
      include: { interviewer: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toFeedback);
  }

  async submitFeedback(
    orgId: string,
    interviewId: string,
    actor: AccessTokenPayload,
    input: SubmitFeedbackInput,
  ): Promise<InterviewFeedbackResponse> {
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, orgId },
      select: { id: true, applicationId: true },
    });
    if (!interview) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy buổi phỏng vấn',
        ERROR_CODES.NOT_FOUND,
      );
    }
    const employee = await this.prisma.employee.findFirst({
      where: { userId: actor.sub, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Tài khoản chưa gắn hồ sơ nhân viên — không thể đánh giá',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const fb = await this.prisma.interviewFeedback.upsert({
      where: {
        interviewId_interviewerId: { interviewId, interviewerId: employee.id },
      },
      create: {
        orgId,
        interviewId,
        interviewerId: employee.id,
        score: input.score ?? null,
        recommendation: input.recommendation,
        comment: input.comment ?? null,
      },
      update: {
        score: input.score ?? null,
        recommendation: input.recommendation,
        comment: input.comment ?? null,
      },
      include: { interviewer: { select: { fullName: true } } },
    });
    await this.recomputeRating(interview.applicationId);
    addAuditMetadata({ after: { recommendation: input.recommendation } });
    return toFeedback(fb);
  }

  // ===== helpers =====

  private parseDate(s: string): Date {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Thời gian phỏng vấn không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    return d;
  }

  private async validPanelists(orgId: string, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const count = await this.prisma.employee.count({
      where: { id: { in: unique }, orgId, deletedAt: null },
    });
    if (count !== unique.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Có thành viên hội đồng không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    return unique;
  }

  private async notifyPanelists(
    orgId: string,
    interview: InterviewWithRels,
  ): Promise<void> {
    const rows = await this.prisma.employee.findMany({
      where: {
        id: { in: interview.panelists.map((p) => p.employeeId) },
        userId: { not: null },
      },
      select: { userId: true },
    });
    const userIds = rows
      .map((r) => r.userId)
      .filter((id): id is string => Boolean(id));
    if (userIds.length === 0) return;
    const when = interview.scheduledAt.toLocaleString('vi-VN');
    await this.notifications.dispatch({
      orgId,
      userIds,
      type: 'GENERAL',
      title: 'Lịch phỏng vấn mới',
      body: `Bạn được mời phỏng vấn ${interview.application.candidate.fullName} lúc ${when}`,
      link: '/dashboard/recruitment',
    });
  }

  private async recomputeRating(applicationId: string): Promise<void> {
    const agg = await this.prisma.interviewFeedback.aggregate({
      where: { interview: { applicationId }, score: { not: null } },
      _avg: { score: true },
    });
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { ratingAvg: agg._avg.score ?? null },
    });
  }

  private async require(orgId: string, id: string) {
    const i = await this.prisma.interview.findFirst({ where: { id, orgId } });
    if (!i) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy buổi phỏng vấn',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return i;
  }
}
