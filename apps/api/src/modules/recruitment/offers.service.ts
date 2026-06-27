import { HttpStatus, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ERROR_CODES,
  type AcceptOfferInput,
  type CreateOfferInput,
  type CursorPaginated,
  type ListOffersQuery,
  type OfferResponse,
  type UpdateOfferInput,
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

const INCLUDE = {
  application: {
    select: {
      id: true,
      candidate: { select: { fullName: true, phone: true, email: true } },
      jobRequisition: {
        select: { title: true, positionId: true, orgUnitId: true },
      },
    },
  },
} as const;

type OfferWithRels = Prisma.OfferGetPayload<{ include: typeof INCLUDE }>;

function dateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function toResponse(o: OfferWithRels): OfferResponse {
  return {
    id: o.id,
    applicationId: o.applicationId,
    candidateName: o.application.candidate.fullName,
    candidatePhone: o.application.candidate.phone,
    jobTitle: o.application.jobRequisition?.title ?? null,
    position: o.position,
    baseSalary: o.baseSalary,
    startDate: dateOnly(o.startDate),
    expiresAt: dateOnly(o.expiresAt),
    status: o.status,
    createdAt: o.createdAt.toISOString(),
  };
}

/** Thư mời nhận việc: tạo → duyệt (OFFER) → gửi → ACCEPTED tạo Employee. */
@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approval: ApprovalService,
    private readonly employees: EmployeesService,
  ) {}

  async list(
    orgId: string,
    query: ListOffersQuery,
  ): Promise<CursorPaginated<OfferResponse>> {
    const where: Prisma.OfferWhereInput = {
      orgId,
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const rows = await this.prisma.offer.findMany({
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
    input: CreateOfferInput,
  ): Promise<OfferResponse> {
    const app = await this.prisma.application.findFirst({
      where: { id: input.applicationId, orgId },
      select: { id: true },
    });
    if (!app) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy hồ sơ ứng tuyển',
        ERROR_CODES.NOT_FOUND,
      );
    }
    const o = await this.prisma.offer.create({
      data: {
        orgId,
        applicationId: input.applicationId,
        position: input.position ?? null,
        baseSalary: input.baseSalary,
        startDate: input.startDate ? new Date(input.startDate) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { applicationId: input.applicationId, baseSalary: input.baseSalary } });
    return toResponse(o);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateOfferInput,
  ): Promise<OfferResponse> {
    const existing = await this.require(orgId, id);
    if (existing.status !== 'DRAFT') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Chỉ sửa được offer khi đang ở trạng thái nháp',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const o = await this.prisma.offer.update({
      where: { id },
      data: {
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.baseSalary !== undefined ? { baseSalary: input.baseSalary } : {}),
        ...(input.startDate !== undefined
          ? { startDate: input.startDate ? new Date(input.startDate) : null }
          : {}),
        ...(input.expiresAt !== undefined
          ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
          : {}),
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { baseSalary: o.baseSalary } });
    return toResponse(o);
  }

  async submit(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
  ): Promise<OfferResponse> {
    const offer = await this.requireFull(orgId, id);
    if (offer.status !== 'DRAFT') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Chỉ gửi duyệt offer đang ở trạng thái nháp',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const requester = await this.prisma.employee.findFirst({
      where: { userId: actor.sub, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!requester) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Tài khoản chưa gắn hồ sơ nhân viên — không thể gửi duyệt',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    // createInstance ném nếu chưa cấu hình flow → offer giữ nguyên DRAFT.
    await this.approval.createInstance(
      orgId,
      'OFFER',
      id,
      requester.id,
      { baseSalary: offer.baseSalary },
      `Offer cho ${offer.application.candidate.fullName}`,
    );
    const updated = await this.prisma.offer.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL' },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { status: 'PENDING_APPROVAL' } });
    return toResponse(updated);
  }

  async decline(orgId: string, id: string): Promise<OfferResponse> {
    const offer = await this.require(orgId, id);
    if (offer.status === 'ACCEPTED' || offer.status === 'DECLINED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Offer đã kết thúc',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    if (offer.status === 'PENDING_APPROVAL') {
      await this.approval.cancelByTarget(orgId, id);
    }
    const o = await this.prisma.offer.update({
      where: { id },
      data: { status: 'DECLINED' },
      include: INCLUDE,
    });
    addAuditMetadata({ before: { status: offer.status }, after: { status: 'DECLINED' } });
    return toResponse(o);
  }

  /** Chấp nhận offer → tạo Employee (kèm tài khoản) + HIRED. */
  async accept(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
    input: AcceptOfferInput,
  ): Promise<OfferResponse & { employeeId: string }> {
    const offer = await this.requireFull(orgId, id);
    if (offer.status !== 'SENT') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Chỉ chấp nhận offer đã được duyệt/gửi',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const cand = offer.application.candidate;
    if (!cand.phone) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Ứng viên chưa có số điện thoại — cập nhật trước khi tạo nhân viên',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const joinDate =
      input.joinDate ?? dateOnly(offer.startDate) ?? new Date().toISOString().slice(0, 10);

    const employee = await this.employees.create(orgId, actor, {
      code: input.employeeCode,
      fullName: cand.fullName,
      phone: cand.phone,
      joinDate,
      status: 'ACTIVE',
      positionId: offer.application.jobRequisition.positionId ?? undefined,
      orgUnitId: offer.application.jobRequisition.orgUnitId ?? undefined,
      inviteEmail: cand.email ?? undefined,
    });

    await this.prisma.$transaction([
      this.prisma.offer.update({ where: { id }, data: { status: 'ACCEPTED' } }),
      this.prisma.application.update({
        where: { id: offer.applicationId },
        data: { stage: 'HIRED' },
      }),
    ]);
    addAuditMetadata({
      after: { status: 'ACCEPTED', employeeId: employee.id, code: input.employeeCode },
    });
    const updated = await this.prisma.offer.findUniqueOrThrow({
      where: { id },
      include: INCLUDE,
    });
    return { ...toResponse(updated), employeeId: employee.id };
  }

  @OnEvent(APP_EVENTS.APPROVAL_DECIDED)
  async onApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    if (event.targetType !== 'OFFER') return;
    const offer = await this.prisma.offer.findFirst({
      where: { id: event.targetId, orgId: event.orgId },
      select: { id: true, status: true },
    });
    if (!offer || offer.status !== 'PENDING_APPROVAL') return;
    await this.prisma.offer.update({
      where: { id: offer.id },
      data: { status: event.status === 'APPROVED' ? 'SENT' : 'DRAFT' },
    });
  }

  // ===== helpers =====

  private async require(orgId: string, id: string) {
    const o = await this.prisma.offer.findFirst({ where: { id, orgId } });
    if (!o) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy offer',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return o;
  }

  private async requireFull(orgId: string, id: string): Promise<OfferWithRels> {
    const o = await this.prisma.offer.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!o) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy offer',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return o;
  }
}
