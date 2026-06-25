import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { ApprovalStepState } from '@repo/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

/**
 * Nhắc & escalation SLA duyệt: định kỳ quét phiếu PENDING, nếu bước hiện tại đã
 * quá `slaHours` → nhắc người duyệt + escalate lên quản lý cấp trên của họ.
 * Nhắc 1 lần cho mỗi bước (mốc `slaRemindedAt`), tự reset khi sang bước mới.
 */
@Injectable()
export class ApprovalSlaService {
  private readonly logger = new Logger(ApprovalSlaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkOverdue(): Promise<void> {
    const now = Date.now();
    const pending = await this.prisma.approvalInstance.findMany({
      where: { status: 'PENDING' },
      select: {
        id: true,
        orgId: true,
        summary: true,
        currentStep: true,
        stepsSnapshot: true,
        slaRemindedAt: true,
        createdAt: true,
      },
    });
    let reminded = 0;
    for (const inst of pending) {
      try {
        if (await this.handle(inst, now)) reminded++;
      } catch (err) {
        this.logger.warn(`SLA check lỗi (instance ${inst.id}): ${(err as Error).message}`);
      }
    }
    if (reminded > 0) this.logger.log(`Đã nhắc SLA cho ${reminded} phiếu quá hạn`);
  }

  private async handle(
    inst: {
      id: string;
      orgId: string;
      summary: string | null;
      currentStep: number;
      stepsSnapshot: unknown;
      slaRemindedAt: Date | null;
      createdAt: Date;
    },
    now: number,
  ): Promise<boolean> {
    const snap = inst.stepsSnapshot as ApprovalStepState[];
    const current = snap.find((s) => s.order === inst.currentStep);
    if (!current || current.slaHours == null || current.approverIds.length === 0) {
      return false;
    }

    // Bước hiện tại bắt đầu khi: tạo phiếu HOẶC bước trước đó được duyệt
    let stepStart = inst.createdAt.getTime();
    for (const s of snap) {
      if (s.order < current.order && s.decidedAt) {
        stepStart = Math.max(stepStart, new Date(s.decidedAt).getTime());
      }
    }
    const deadline = stepStart + current.slaHours * 3_600_000;
    if (now <= deadline) return false; // chưa quá hạn
    // Đã nhắc cho CHÍNH bước này rồi → bỏ qua (tránh spam mỗi lần cron chạy)
    if (inst.slaRemindedAt && inst.slaRemindedAt.getTime() >= stepStart) return false;

    await this.notifications.dispatch({
      orgId: inst.orgId,
      userIds: current.approverIds,
      type: 'APPROVAL_PENDING',
      title: 'Nhắc: đơn quá hạn duyệt',
      body: inst.summary ?? 'Có đơn đã quá thời hạn duyệt, vui lòng xử lý sớm',
      link: '/dashboard/approvals',
      data: { approvalInstanceId: inst.id, sla: 'overdue' },
    });

    // Escalation: báo quản lý cấp trên của người duyệt
    const managerUserIds = await this.resolveManagerUserIds(current.approverIds);
    if (managerUserIds.length > 0) {
      await this.notifications.dispatch({
        orgId: inst.orgId,
        userIds: managerUserIds,
        type: 'GENERAL',
        title: 'Cấp dưới chưa duyệt đơn quá hạn',
        body: inst.summary ?? 'Một đơn đã quá hạn nhưng người duyệt chưa xử lý',
        link: '/dashboard/approvals',
        data: { approvalInstanceId: inst.id, sla: 'escalation' },
      });
    }

    await this.prisma.approvalInstance.update({
      where: { id: inst.id },
      data: { slaRemindedAt: new Date() },
    });
    return true;
  }

  /** userId quản lý cấp trên của các approver (loại trùng + loại chính approver). */
  private async resolveManagerUserIds(approverUserIds: string[]): Promise<string[]> {
    const emps = await this.prisma.employee.findMany({
      where: { userId: { in: approverUserIds }, managerId: { not: null } },
      select: { managerId: true },
    });
    const managerEmpIds = [...new Set(emps.map((e) => e.managerId).filter((id): id is string => !!id))];
    if (managerEmpIds.length === 0) return [];
    const managers = await this.prisma.employee.findMany({
      where: { id: { in: managerEmpIds }, userId: { not: null } },
      select: { userId: true },
    });
    const approverSet = new Set(approverUserIds);
    return [
      ...new Set(
        managers
          .map((m) => m.userId)
          .filter((id): id is string => !!id && !approverSet.has(id)),
      ),
    ];
  }
}
