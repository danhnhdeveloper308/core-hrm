import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type ApplicationResponse,
  type CreateApplicationInput,
  type CursorPaginated,
  type ListApplicationsQuery,
  type UpdateApplicationStageInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const INCLUDE = {
  candidate: { select: { fullName: true, email: true, phone: true } },
  jobRequisition: { select: { title: true } },
} as const;

type ApplicationWithRels = Prisma.ApplicationGetPayload<{
  include: typeof INCLUDE;
}>;

function toResponse(a: ApplicationWithRels): ApplicationResponse {
  return {
    id: a.id,
    candidateId: a.candidateId,
    candidateName: a.candidate.fullName,
    candidateEmail: a.candidate.email,
    candidatePhone: a.candidate.phone,
    jobRequisitionId: a.jobRequisitionId,
    jobTitle: a.jobRequisition?.title ?? null,
    stage: a.stage,
    ratingAvg: a.ratingAvg,
    rejectReason: a.rejectReason,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Hồ sơ ứng tuyển — Kanban theo stage. */
@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    orgId: string,
    query: ListApplicationsQuery,
  ): Promise<CursorPaginated<ApplicationResponse>> {
    const where: Prisma.ApplicationWhereInput = {
      orgId,
      ...(query.jobRequisitionId
        ? { jobRequisitionId: query.jobRequisitionId }
        : {}),
      ...(query.stage ? { stage: query.stage } : {}),
    };
    const rows = await this.prisma.application.findMany({
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

  async create(
    orgId: string,
    input: CreateApplicationInput,
  ): Promise<ApplicationResponse> {
    const req = await this.prisma.jobRequisition.findFirst({
      where: { id: input.jobRequisitionId, orgId },
      select: { id: true },
    });
    if (!req) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy tin tuyển dụng',
        ERROR_CODES.NOT_FOUND,
      );
    }

    let candidateId = input.candidateId ?? null;
    if (!candidateId && input.candidate) {
      const c = await this.prisma.candidate.create({
        data: {
          orgId,
          fullName: input.candidate.fullName,
          email: input.candidate.email ?? null,
          phone: input.candidate.phone ?? null,
          source: input.candidate.source ?? null,
          note: input.candidate.note ?? null,
        },
      });
      candidateId = c.id;
    }
    if (!candidateId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Cần chọn hoặc tạo ứng viên',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const cand = await this.prisma.candidate.findFirst({
      where: { id: candidateId, orgId },
      select: { id: true },
    });
    if (!cand) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy ứng viên',
        ERROR_CODES.NOT_FOUND,
      );
    }

    const dup = await this.prisma.application.findFirst({
      where: { candidateId, jobRequisitionId: input.jobRequisitionId },
      select: { id: true },
    });
    if (dup) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Ứng viên đã ứng tuyển tin này',
        ERROR_CODES.ORG_CODE_TAKEN,
      );
    }

    const a = await this.prisma.application.create({
      data: {
        orgId,
        candidateId,
        jobRequisitionId: input.jobRequisitionId,
        stage: 'APPLIED',
      },
      include: INCLUDE,
    });
    addAuditMetadata({
      after: { candidateId, jobRequisitionId: input.jobRequisitionId },
    });
    return toResponse(a);
  }

  async updateStage(
    orgId: string,
    id: string,
    input: UpdateApplicationStageInput,
  ): Promise<ApplicationResponse> {
    const existing = await this.prisma.application.findFirst({
      where: { id, orgId },
      select: { id: true, stage: true },
    });
    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy hồ sơ ứng tuyển',
        ERROR_CODES.NOT_FOUND,
      );
    }
    const a = await this.prisma.application.update({
      where: { id },
      data: {
        stage: input.stage,
        rejectReason:
          input.stage === 'REJECTED' ? (input.rejectReason ?? null) : null,
      },
      include: INCLUDE,
    });
    addAuditMetadata({
      before: { stage: existing.stage },
      after: { stage: input.stage },
    });
    return toResponse(a);
  }
}
