import { HttpStatus, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ERROR_CODES,
  type CreatePayrollRunInput,
  type CursorPaginated,
  type ListPayrollRunsQuery,
  type PayrollRunResponse,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import {
  APP_EVENTS,
  type ApprovalDecidedEvent,
} from '../../common/events/app.events';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PayrollQueueService } from '../../queues/payroll.queue';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalService } from '../approval/approval.service';

type RunRow = Prisma.PayrollRunGetPayload<object>;

interface RunTotals {
  payslipCount: number;
  totalGross: number;
  totalNet: number;
  totalPit: number;
  totalInsurance: number;
}

const ZERO: RunTotals = {
  payslipCount: 0,
  totalGross: 0,
  totalNet: 0,
  totalPit: 0,
  totalInsurance: 0,
};

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

function toResponse(r: RunRow, totals: RunTotals): PayrollRunResponse {
  return {
    id: r.id,
    month: r.month,
    status: r.status,
    payslipCount: totals.payslipCount,
    totalGross: totals.totalGross,
    totalNet: totals.totalNet,
    totalPit: totals.totalPit,
    totalInsurance: totals.totalInsurance,
    runAt: r.runAt?.toISOString() ?? null,
    paidAt: r.paidAt?.toISOString() ?? null,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Kỳ lương: tạo → tính (BullMQ) → duyệt (PAYROLL_RUN) → chốt PAID (khoá). */
@Injectable()
export class PayrollRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approval: ApprovalService,
    private readonly queue: PayrollQueueService,
  ) {}

  private async totalsFor(runIds: string[]): Promise<Map<string, RunTotals>> {
    if (runIds.length === 0) return new Map();
    const grouped = await this.prisma.payslip.groupBy({
      by: ['runId'],
      where: { runId: { in: runIds } },
      _count: { _all: true },
      _sum: { grossEarnings: true, netPay: true, pit: true, insuranceTotal: true },
    });
    return new Map(
      grouped.map((g) => [
        g.runId,
        {
          payslipCount: g._count._all,
          totalGross: g._sum.grossEarnings ?? 0,
          totalNet: g._sum.netPay ?? 0,
          totalPit: g._sum.pit ?? 0,
          totalInsurance: g._sum.insuranceTotal ?? 0,
        },
      ]),
    );
  }

  async list(
    orgId: string,
    query: ListPayrollRunsQuery,
  ): Promise<CursorPaginated<PayrollRunResponse>> {
    const rows = await this.prisma.payrollRun.findMany({
      where: { orgId, ...(query.status ? { status: query.status } : {}) },
      orderBy: [{ month: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const totals = await this.totalsFor(items.map((r) => r.id));
    return {
      items: items.map((r) => toResponse(r, totals.get(r.id) ?? ZERO)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async get(orgId: string, id: string): Promise<PayrollRunResponse> {
    const run = await this.require(orgId, id);
    const totals = await this.totalsFor([id]);
    return toResponse(run, totals.get(id) ?? ZERO);
  }

  async create(
    orgId: string,
    input: CreatePayrollRunInput,
  ): Promise<PayrollRunResponse> {
    const dup = await this.prisma.payrollRun.findFirst({
      where: { orgId, month: input.month },
      select: { id: true },
    });
    if (dup) {
      throw new AppException(
        HttpStatus.CONFLICT,
        `Kỳ lương tháng ${input.month} đã tồn tại`,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const created = await this.prisma.payrollRun.create({
      data: { orgId, month: input.month, note: input.note ?? null },
    });
    addAuditMetadata({ after: { month: input.month } });
    return toResponse(created, ZERO);
  }

  /** Đẩy job tính lương (idempotent — worker xoá payslip cũ rồi tính lại). */
  async calculate(orgId: string, id: string): Promise<PayrollRunResponse> {
    const run = await this.require(orgId, id);
    if (run.status !== 'DRAFT' && run.status !== 'CALCULATED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Chỉ tính lại kỳ ở trạng thái nháp / đã tính',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    await this.queue.enqueueCalc({ orgId, runId: id });
    addAuditMetadata({ after: { month: run.month, action: 'calculate' } });
    const totals = await this.totalsFor([id]);
    return toResponse(run, totals.get(id) ?? ZERO);
  }

  /** Gửi duyệt kỳ lương (PAYROLL_RUN). Không cấu hình luồng → APPROVED luôn. */
  async submit(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
  ): Promise<PayrollRunResponse> {
    const run = await this.require(orgId, id);
    if (run.status !== 'CALCULATED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Chỉ gửi duyệt kỳ đã tính xong',
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
    let nextStatus: 'PENDING_APPROVAL' | 'APPROVED' = 'APPROVED';
    try {
      const res = await this.approval.createInstance(
        orgId,
        'PAYROLL_RUN',
        id,
        requester.id,
        {},
        `Duyệt bảng lương tháng ${run.month}`,
      );
      nextStatus = res.status === 'APPROVED' ? 'APPROVED' : 'PENDING_APPROVAL';
    } catch (err) {
      if (!isNoFlow(err)) throw err;
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: { status: nextStatus },
    });
    addAuditMetadata({ after: { status: nextStatus } });
    const totals = await this.totalsFor([id]);
    return toResponse(updated, totals.get(id) ?? ZERO);
  }

  /** Chốt đã chi lương (khoá kỳ). */
  async pay(orgId: string, id: string): Promise<PayrollRunResponse> {
    const run = await this.require(orgId, id);
    if (run.status !== 'APPROVED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Chỉ chốt chi kỳ đã được duyệt',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date() },
    });
    addAuditMetadata({ before: { status: 'APPROVED' }, after: { status: 'PAID' } });
    const totals = await this.totalsFor([id]);
    return toResponse(updated, totals.get(id) ?? ZERO);
  }

  async remove(orgId: string, id: string): Promise<{ id: string }> {
    const run = await this.require(orgId, id);
    if (run.status !== 'DRAFT' && run.status !== 'CALCULATED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Chỉ xoá kỳ chưa duyệt',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    if (run.status === 'CALCULATED') {
      await this.approval.cancelByTarget(orgId, id);
    }
    await this.prisma.payrollRun.delete({ where: { id } });
    addAuditMetadata({ before: { month: run.month } });
    return { id };
  }

  @OnEvent(APP_EVENTS.APPROVAL_DECIDED)
  async onApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    if (event.targetType !== 'PAYROLL_RUN') return;
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: event.targetId, orgId: event.orgId },
      select: { id: true, status: true },
    });
    if (!run || run.status !== 'PENDING_APPROVAL') return;
    await this.prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: event.status === 'APPROVED' ? 'APPROVED' : 'CALCULATED' },
    });
  }

  private async require(orgId: string, id: string): Promise<RunRow> {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, orgId } });
    if (!run) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy kỳ lương',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return run;
  }
}
