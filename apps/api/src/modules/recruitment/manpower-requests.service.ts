import { HttpStatus, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ERROR_CODES,
  type CreateManpowerRequestInput,
  type CursorPaginated,
  type ListManpowerRequestsQuery,
  type ManpowerRequestResponse,
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

const INCLUDE = {
  orgUnit: { select: { name: true } },
  position: { select: { name: true } },
  requester: { select: { fullName: true } },
} as const;

type ManpowerWithRels = Prisma.ManpowerRequestGetPayload<{
  include: typeof INCLUDE;
}>;

function toResponse(m: ManpowerWithRels): ManpowerRequestResponse {
  return {
    id: m.id,
    orgUnitId: m.orgUnitId,
    orgUnitName: m.orgUnit?.name ?? null,
    positionId: m.positionId,
    positionName: m.position?.name ?? null,
    quantity: m.quantity,
    reason: m.reason,
    neededBy: m.neededBy ? m.neededBy.toISOString().slice(0, 10) : null,
    budgetSalary: m.budgetSalary,
    status: m.status,
    requesterId: m.requesterId,
    requesterName: m.requester?.fullName ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Yêu cầu tuyển dụng: tạo → duyệt (engine MANPOWER_REQUEST) → APPROVED mở tin. */
@Injectable()
export class ManpowerRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approval: ApprovalService,
  ) {}

  async create(
    orgId: string,
    actor: AccessTokenPayload,
    input: CreateManpowerRequestInput,
  ): Promise<ManpowerRequestResponse> {
    const requester = await this.prisma.employee.findFirst({
      where: { userId: actor.sub, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!requester) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Tài khoản chưa gắn hồ sơ nhân viên — không thể tạo yêu cầu tuyển dụng',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const created = await this.prisma.manpowerRequest.create({
      data: {
        orgId,
        orgUnitId: input.orgUnitId ?? null,
        positionId: input.positionId ?? null,
        quantity: input.quantity,
        reason: input.reason,
        neededBy: input.neededBy ? new Date(input.neededBy) : null,
        budgetSalary: input.budgetSalary ?? null,
        requesterId: requester.id,
      },
      include: INCLUDE,
    });

    // Tạo phiếu duyệt; chưa cấu hình flow → rollback để tránh yêu cầu mồ côi.
    try {
      await this.approval.createInstance(
        orgId,
        'MANPOWER_REQUEST',
        created.id,
        requester.id,
        {
          quantity: input.quantity,
          positionId: input.positionId ?? null,
          orgUnitId: input.orgUnitId ?? null,
          budgetSalary: input.budgetSalary ?? null,
        },
        `Yêu cầu tuyển ${input.quantity} ${created.position?.name ?? 'nhân sự'}`,
      );
    } catch (err) {
      await this.prisma.manpowerRequest.delete({ where: { id: created.id } });
      throw err;
    }

    addAuditMetadata({
      after: { quantity: input.quantity, positionId: input.positionId ?? null },
    });
    return toResponse(created);
  }

  async list(
    orgId: string,
    query: ListManpowerRequestsQuery,
  ): Promise<CursorPaginated<ManpowerRequestResponse>> {
    const rows = await this.prisma.manpowerRequest.findMany({
      where: { orgId, ...(query.status ? { status: query.status } : {}) },
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

  async get(orgId: string, id: string): Promise<ManpowerRequestResponse> {
    const m = await this.prisma.manpowerRequest.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!m) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy yêu cầu tuyển dụng',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return toResponse(m);
  }

  async cancel(orgId: string, id: string): Promise<ManpowerRequestResponse> {
    const m = await this.prisma.manpowerRequest.findFirst({
      where: { id, orgId },
    });
    if (!m) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy yêu cầu tuyển dụng',
        ERROR_CODES.NOT_FOUND,
      );
    }
    if (m.status !== 'PENDING') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Chỉ huỷ được yêu cầu đang chờ duyệt',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    await this.approval.cancelByTarget(orgId, id);
    const updated = await this.prisma.manpowerRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: INCLUDE,
    });
    addAuditMetadata({ before: { status: m.status }, after: { status: 'CANCELLED' } });
    return toResponse(updated);
  }

  /** Áp kết quả duyệt MANPOWER_REQUEST → APPROVED/REJECTED. */
  @OnEvent(APP_EVENTS.APPROVAL_DECIDED)
  async onApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    if (event.targetType !== 'MANPOWER_REQUEST') return;
    const m = await this.prisma.manpowerRequest.findFirst({
      where: { id: event.targetId, orgId: event.orgId },
    });
    if (!m || m.status !== 'PENDING') return;
    await this.prisma.manpowerRequest.update({
      where: { id: m.id },
      data: { status: event.status === 'APPROVED' ? 'APPROVED' : 'REJECTED' },
    });
  }
}
