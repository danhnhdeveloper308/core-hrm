import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ERROR_CODES,
  type AdjustBalanceInput,
  type CreateLeaveRequestInput,
  type LeaveBalanceResponse,
  type LeaveLedgerEntryResponse,
  type LeaveRequestResponse,
  type ListLeaveRequestsQuery,
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
import { TimesheetQueueService } from '../../queues/timesheet.queue';
import { ApprovalService } from '../approval/approval.service';
import { EmployeesService } from '../employees/employees.service';
import { CalendarsService } from '../schedule/calendars.service';
import { ShiftsService } from '../schedule/shifts.service';
import { enumerateDates, leaveDaysCount } from './leave.engine';

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approval: ApprovalService,
    private readonly employees: EmployeesService,
    private readonly calendars: CalendarsService,
    private readonly shifts: ShiftsService,
    private readonly recalcQueue: TimesheetQueueService,
  ) {}

  // ===== Số dư (ledger) =====

  /** Số dư từng loại phép theo năm = tổng bút toán − pending (đơn chờ duyệt). */
  async getBalance(
    orgId: string,
    employeeId: string,
    year: number,
  ): Promise<LeaveBalanceResponse[]> {
    const types = await this.prisma.leaveType.findMany({ where: { orgId } });
    const entries = await this.prisma.leaveBalanceEntry.findMany({
      where: { orgId, employeeId, year },
    });
    const pendingReqs = await this.prisma.leaveRequest.findMany({
      where: { orgId, employeeId, status: 'PENDING' },
      select: { leaveTypeId: true, totalDays: true },
    });

    return types.map((t) => {
      const typeEntries = entries.filter((e) => e.leaveTypeId === t.id);
      let granted = 0;
      let deducted = 0;
      let carryOverExpiring = 0;
      for (const e of typeEntries) {
        const amt = Number(e.amount);
        if (amt >= 0) granted += amt;
        else deducted += -amt;
        if (e.type === 'CARRY_OVER' && e.expiresAt) carryOverExpiring += amt;
      }
      const pending = pendingReqs
        .filter((r) => r.leaveTypeId === t.id)
        .reduce((s, r) => s + Number(r.totalDays), 0);
      return {
        leaveTypeId: t.id,
        leaveTypeName: t.name,
        leaveTypeColor: t.color,
        paid: t.paid,
        year,
        accrued: round2(granted),
        used: round2(deducted),
        pending: round2(pending),
        available: round2(granted - deducted - pending),
        carryOverExpiring: round2(carryOverExpiring),
      };
    });
  }

  /** Số dư của chính actor (qua hồ sơ nhân viên). */
  async balanceForActor(
    orgId: string,
    userId: string,
    year: number,
  ): Promise<LeaveBalanceResponse[]> {
    const emp = await this.requireOwnEmployee(orgId, userId);
    return this.getBalance(orgId, emp.id, year);
  }

  async ledgerForActor(
    orgId: string,
    userId: string,
    year: number,
  ): Promise<LeaveLedgerEntryResponse[]> {
    const emp = await this.requireOwnEmployee(orgId, userId);
    return this.getLedger(orgId, emp.id, year);
  }

  async getLedger(
    orgId: string,
    employeeId: string,
    year: number,
  ): Promise<LeaveLedgerEntryResponse[]> {
    const entries = await this.prisma.leaveBalanceEntry.findMany({
      where: { orgId, employeeId, year },
      orderBy: { createdAt: 'desc' },
    });
    return entries.map((e) => ({
      id: e.id,
      leaveTypeId: e.leaveTypeId,
      year: e.year,
      amount: Number(e.amount),
      type: e.type,
      reason: e.reason,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  /** HR điều chỉnh số dư (bút toán ADJUSTMENT + lý do). */
  async adjustBalance(
    orgId: string,
    actor: AccessTokenPayload,
    input: AdjustBalanceInput,
  ): Promise<{ message: string }> {
    await this.requireEmployeeInOrg(orgId, input.employeeId);
    await this.prisma.leaveBalanceEntry.create({
      data: {
        orgId,
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        year: input.year,
        amount: input.amount,
        type: 'ADJUSTMENT',
        reason: input.reason,
        createdById: actor.sub,
      },
    });
    addAuditMetadata({ after: { ...input } });
    return { message: 'Đã điều chỉnh số dư phép' };
  }

  // ===== Đơn nghỉ phép =====

  async createRequest(
    orgId: string,
    actor: AccessTokenPayload,
    input: CreateLeaveRequestInput,
  ): Promise<LeaveRequestResponse> {
    const employee = await this.requireOwnEmployee(orgId, actor.sub);
    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id: input.leaveTypeId, orgId },
    });
    if (!leaveType) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Loại phép không tồn tại', ERROR_CODES.NOT_FOUND);
    }
    const policy = await this.resolvePolicy(orgId, input.leaveTypeId, employee.orgUnitId);
    if (!policy) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Chưa cấu hình chính sách cho loại phép này',
        ERROR_CODES.LEAVE_NO_POLICY,
      );
    }

    // Trùng đơn (PENDING/APPROVED) chồng ngày
    const overlap = await this.prisma.leaveRequest.findFirst({
      where: {
        orgId,
        employeeId: employee.id,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: new Date(input.endDate) },
        endDate: { gte: new Date(input.startDate) },
      },
    });
    if (overlap) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Đã có đơn nghỉ trùng khoảng ngày này',
        ERROR_CODES.LEAVE_OVERLAP,
      );
    }

    // Tính số ngày phép = ngày làm việc trong khoảng (trừ lễ/cuối tuần), nửa ngày 2 đầu
    const dates = enumerateDates(input.startDate, input.endDate);
    const shift = await this.shifts.resolveShift(employee.id, input.startDate);
    const workingSet = new Set<string>();
    for (const d of dates) {
      const info = await this.calendars.isWorkingDay(
        orgId,
        employee.orgUnitId,
        d,
        shift?.workDays,
      );
      if (info.working) workingSet.add(d);
    }
    const totalDays = leaveDaysCount(dates, input.startHalf, input.endHalf, (d) =>
      workingSet.has(d),
    );
    if (totalDays <= 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Khoảng nghỉ không có ngày làm việc nào',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Đủ số dư khả dụng (trừ khi policy cho phép âm)
    if (!policy.allowNegativeBalance) {
      const year = new Date(input.startDate).getUTCFullYear();
      const balances = await this.getBalance(orgId, employee.id, year);
      const bal = balances.find((b) => b.leaveTypeId === input.leaveTypeId);
      if (bal && totalDays > bal.available) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          `Không đủ số dư phép (còn ${bal.available} ngày, cần ${totalDays})`,
          ERROR_CODES.LEAVE_INSUFFICIENT_BALANCE,
          { available: bal.available, requested: totalDays },
        );
      }
    }

    const request = await this.prisma.leaveRequest.create({
      data: {
        orgId,
        employeeId: employee.id,
        leaveTypeId: input.leaveTypeId,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        startHalf: input.startHalf,
        endHalf: input.endHalf,
        totalDays,
        reason: input.reason,
        status: 'PENDING',
      },
    });

    // Tạo luồng duyệt (resolve theo vị trí requester trên cây)
    await this.approval.createInstance(orgId, 'LEAVE', request.id, employee.id, {
      totalDays,
      leaveTypeCode: leaveType.code,
      paid: leaveType.paid,
    });

    addAuditMetadata({ after: { leaveType: leaveType.code, totalDays, ...input } });
    return this.toRequestResponse(request.id);
  }

  async cancelRequest(
    orgId: string,
    actor: AccessTokenPayload,
    requestId: string,
  ): Promise<LeaveRequestResponse> {
    const employee = await this.requireOwnEmployee(orgId, actor.sub);
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id: requestId, orgId, employeeId: employee.id },
    });
    if (!request) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Không tìm thấy đơn', ERROR_CODES.NOT_FOUND);
    }
    if (request.status === 'CANCELLED' || request.status === 'REJECTED') {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Đơn đã đóng',
        ERROR_CODES.LEAVE_NOT_PENDING,
      );
    }

    await this.approval.cancelByTarget(orgId, requestId);
    // Nếu đơn đã APPROVED → hoàn phép (REVERT) + tính lại công các ngày
    if (request.status === 'APPROVED') {
      await this.prisma.leaveBalanceEntry.create({
        data: {
          orgId,
          employeeId: employee.id,
          leaveTypeId: request.leaveTypeId,
          year: request.startDate.getUTCFullYear(),
          amount: Number(request.totalDays),
          type: 'REVERT',
          reason: `Huỷ đơn nghỉ ${requestId}`,
          requestId,
          createdById: actor.sub,
        },
      });
      await this.recalcRange(orgId, employee.id, request.startDate, request.endDate);
    }
    await this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED' },
    });
    addAuditMetadata({ before: { status: request.status }, after: { status: 'CANCELLED' } });
    return this.toRequestResponse(requestId);
  }

  async listRequests(
    orgId: string,
    actor: AccessTokenPayload,
    query: ListLeaveRequestsQuery,
  ): Promise<LeaveRequestResponse[]> {
    const where: Prisma.LeaveRequestWhereInput = {
      orgId,
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.scope === 'mine') {
      const employee = await this.requireOwnEmployee(orgId, actor.sub);
      where.employeeId = employee.id;
    } else if (query.scope === 'team') {
      const scopePaths = await this.employees.resolveScopePaths(actor);
      if (scopePaths) {
        where.employee = {
          is: { OR: scopePaths.map((p) => ({ orgUnit: { is: { path: { startsWith: p } } } })) },
        };
      }
    }
    // scope 'all' chỉ dành HR (kiểm soát ở permission route)

    const requests = await this.prisma.leaveRequest.findMany({
      where,
      include: { employee: { select: { fullName: true } }, leaveType: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return requests.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.fullName,
      leaveTypeId: r.leaveTypeId,
      leaveTypeName: r.leaveType.name,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      startHalf: r.startHalf,
      endHalf: r.endHalf,
      totalDays: Number(r.totalDays),
      reason: r.reason,
      status: r.status,
      approvalInstanceId: null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ===== Hệ quả khi duyệt xong =====

  /** Đơn được duyệt/từ chối → cập nhật trạng thái + ledger + recalc. */
  @OnEvent(APP_EVENTS.APPROVAL_DECIDED)
  async onApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    if (event.targetType !== 'LEAVE') return;
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id: event.targetId, orgId: event.orgId },
    });
    if (!request || request.status !== 'PENDING') return;

    if (event.status === 'REJECTED') {
      await this.prisma.leaveRequest.update({
        where: { id: request.id },
        data: { status: 'REJECTED' },
      });
      return;
    }

    // APPROVED: trừ phép (USAGE âm) + recalc các ngày → ON_LEAVE/HALF_LEAVE
    await this.prisma.$transaction([
      this.prisma.leaveRequest.update({
        where: { id: request.id },
        data: { status: 'APPROVED' },
      }),
      this.prisma.leaveBalanceEntry.create({
        data: {
          orgId: request.orgId,
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year: request.startDate.getUTCFullYear(),
          amount: -Number(request.totalDays),
          type: 'USAGE',
          reason: `Đơn nghỉ ${request.id}`,
          requestId: request.id,
        },
      }),
    ]);
    await this.recalcRange(request.orgId, request.employeeId, request.startDate, request.endDate);
  }

  // ===== Resolve chính sách kế thừa theo cây =====

  /** Policy của (org, leaveType): leo unit từ gần → xa, fallback org default. */
  async resolvePolicy(orgId: string, leaveTypeId: string, orgUnitId: string | null) {
    if (orgUnitId) {
      const unit = await this.prisma.orgUnit.findFirst({
        where: { id: orgUnitId, orgId },
        select: { path: true },
      });
      if (unit) {
        const ids = unit.path.split('/').filter(Boolean);
        const policies = await this.prisma.leavePolicy.findMany({
          where: { orgId, leaveTypeId, orgUnitId: { in: ids } },
        });
        const byUnit = new Map(policies.map((p) => [p.orgUnitId, p]));
        for (let i = ids.length - 1; i >= 0; i--) {
          const p = byUnit.get(ids[i]!);
          if (p) return p;
        }
      }
    }
    return this.prisma.leavePolicy.findFirst({
      where: { orgId, leaveTypeId, orgUnitId: null },
    });
  }

  // ===== helpers =====

  private async recalcRange(
    orgId: string,
    employeeId: string,
    start: Date,
    end: Date,
  ): Promise<void> {
    for (const d of enumerateDates(
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
    )) {
      await this.recalcQueue.enqueueRecalc({ orgId, employeeId, date: d });
    }
  }

  private async toRequestResponse(id: string): Promise<LeaveRequestResponse> {
    const r = await this.prisma.leaveRequest.findUniqueOrThrow({
      where: { id },
      include: { employee: { select: { fullName: true } }, leaveType: { select: { name: true } } },
    });
    return {
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.fullName,
      leaveTypeId: r.leaveTypeId,
      leaveTypeName: r.leaveType.name,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      startHalf: r.startHalf,
      endHalf: r.endHalf,
      totalDays: Number(r.totalDays),
      reason: r.reason,
      status: r.status,
      approvalInstanceId: null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async requireOwnEmployee(orgId: string, userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { orgId, userId },
      select: { id: true, orgUnitId: true },
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

  private async requireEmployeeInOrg(orgId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, orgId },
      select: { id: true },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy nhân viên',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return employee;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
