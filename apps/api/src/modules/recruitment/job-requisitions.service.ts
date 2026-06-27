import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateJobRequisitionInput,
  type CursorPaginated,
  type JobRequisitionResponse,
  type ListJobRequisitionsQuery,
  type UpdateJobRequisitionInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const INCLUDE = {
  orgUnit: { select: { name: true } },
  position: { select: { name: true } },
} as const;

type RequisitionWithRels = Prisma.JobRequisitionGetPayload<{
  include: typeof INCLUDE;
}>;

function toResponse(r: RequisitionWithRels): JobRequisitionResponse {
  return {
    id: r.id,
    manpowerRequestId: r.manpowerRequestId,
    title: r.title,
    orgUnitId: r.orgUnitId,
    orgUnitName: r.orgUnit?.name ?? null,
    positionId: r.positionId,
    positionName: r.position?.name ?? null,
    headcount: r.headcount,
    description: r.description,
    requirements: r.requirements,
    salaryFrom: r.salaryFrom,
    salaryTo: r.salaryTo,
    employmentType: r.employmentType,
    status: r.status,
    openedAt: r.openedAt ? r.openedAt.toISOString() : null,
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Tin tuyển dụng (JobRequisition) — CRUD + chuyển trạng thái mở/đóng. */
@Injectable()
export class JobRequisitionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    orgId: string,
    input: CreateJobRequisitionInput,
  ): Promise<JobRequisitionResponse> {
    if (input.manpowerRequestId) {
      const m = await this.prisma.manpowerRequest.findFirst({
        where: { id: input.manpowerRequestId, orgId },
        select: { status: true },
      });
      if (!m) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'Không tìm thấy yêu cầu tuyển dụng',
          ERROR_CODES.NOT_FOUND,
        );
      }
      if (m.status !== 'APPROVED') {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Chỉ mở tin từ yêu cầu tuyển dụng đã được duyệt',
          ERROR_CODES.VALIDATION_ERROR,
        );
      }
    }
    const status = input.status ?? 'DRAFT';
    const created = await this.prisma.jobRequisition.create({
      data: {
        orgId,
        manpowerRequestId: input.manpowerRequestId ?? null,
        title: input.title,
        orgUnitId: input.orgUnitId ?? null,
        positionId: input.positionId ?? null,
        headcount: input.headcount,
        description: input.description ?? null,
        requirements: input.requirements ?? null,
        salaryFrom: input.salaryFrom ?? null,
        salaryTo: input.salaryTo ?? null,
        employmentType: input.employmentType ?? null,
        status,
        openedAt: status === 'OPEN' ? new Date() : null,
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { title: created.title, status: created.status } });
    return toResponse(created);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateJobRequisitionInput,
  ): Promise<JobRequisitionResponse> {
    const existing = await this.requireRequisition(orgId, id);
    const data: Prisma.JobRequisitionUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.headcount !== undefined) data.headcount = input.headcount;
    if (input.description !== undefined) data.description = input.description;
    if (input.requirements !== undefined) data.requirements = input.requirements;
    if (input.salaryFrom !== undefined) data.salaryFrom = input.salaryFrom;
    if (input.salaryTo !== undefined) data.salaryTo = input.salaryTo;
    if (input.employmentType !== undefined) data.employmentType = input.employmentType;
    if (input.orgUnitId !== undefined) {
      data.orgUnit = input.orgUnitId
        ? { connect: { id: input.orgUnitId } }
        : { disconnect: true };
    }
    if (input.positionId !== undefined) {
      data.position = input.positionId
        ? { connect: { id: input.positionId } }
        : { disconnect: true };
    }
    if (input.status !== undefined && input.status !== existing.status) {
      data.status = input.status;
      if (input.status === 'OPEN' && !existing.openedAt) data.openedAt = new Date();
      if (input.status === 'CLOSED' || input.status === 'FILLED') {
        data.closedAt = new Date();
      }
    }
    const updated = await this.prisma.jobRequisition.update({
      where: { id },
      data,
      include: INCLUDE,
    });
    addAuditMetadata({
      before: { status: existing.status },
      after: { status: updated.status, title: updated.title },
    });
    return toResponse(updated);
  }

  async list(
    orgId: string,
    query: ListJobRequisitionsQuery,
  ): Promise<CursorPaginated<JobRequisitionResponse>> {
    const where: Prisma.JobRequisitionWhereInput = {
      orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const rows = await this.prisma.jobRequisition.findMany({
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

  async get(orgId: string, id: string): Promise<JobRequisitionResponse> {
    const r = await this.prisma.jobRequisition.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!r) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy tin tuyển dụng',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return toResponse(r);
  }

  private async requireRequisition(orgId: string, id: string) {
    const r = await this.prisma.jobRequisition.findFirst({
      where: { id, orgId },
    });
    if (!r) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy tin tuyển dụng',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return r;
  }
}
