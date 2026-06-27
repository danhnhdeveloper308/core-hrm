import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ORG_ROLES, type ContractStatus } from '@repo/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

const MS_PER_DAY = 86_400_000;
/** Mốc nhắc trước khi hết hạn (ngày). Cron chạy 1 lần/ngày → mỗi mốc nhắc 1 lần. */
const REMIND_DAYS = [30, 15, 7, 0];

/**
 * Nhắc hợp đồng sắp hết hạn + tự cập nhật trạng thái EXPIRING/EXPIRED. Quét hàng
 * ngày các HĐ ACTIVE/EXPIRING có endDate; báo HR (ORG_ADMIN/HR_MANAGER) + quản lý
 * trực tiếp của NV qua NotificationService.
 */
@Injectable()
export class ContractReminderService {
  private readonly logger = new Logger(ContractReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async remind(): Promise<void> {
    const contracts = await this.prisma.employmentContract.findMany({
      where: {
        deletedAt: null,
        endDate: { not: null },
        status: { in: ['ACTIVE', 'EXPIRING'] },
      },
      select: {
        id: true,
        orgId: true,
        endDate: true,
        status: true,
        code: true,
        employee: {
          select: { fullName: true, manager: { select: { userId: true } } },
        },
      },
    });
    if (contracts.length === 0) return;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const hrByOrg = new Map<string, string[]>();
    for (const orgId of new Set(contracts.map((c) => c.orgId))) {
      hrByOrg.set(orgId, await this.hrUserIds(orgId));
    }

    for (const c of contracts) {
      if (!c.endDate) continue;
      const end = new Date(c.endDate);
      end.setUTCHours(0, 0, 0, 0);
      const daysLeft = Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);

      const nextStatus: ContractStatus =
        daysLeft < 0 ? 'EXPIRED' : daysLeft <= 30 ? 'EXPIRING' : c.status;
      if (nextStatus !== c.status) {
        await this.prisma.employmentContract.update({
          where: { id: c.id },
          data: { status: nextStatus },
        });
      }

      if (!REMIND_DAYS.includes(daysLeft)) continue;
      const recipients = new Set<string>(hrByOrg.get(c.orgId) ?? []);
      if (c.employee.manager?.userId) recipients.add(c.employee.manager.userId);
      if (recipients.size === 0) continue;

      const label = c.code ? `HĐ ${c.code}` : 'Hợp đồng';
      const body =
        daysLeft === 0
          ? `${label} của ${c.employee.fullName} hết hạn HÔM NAY.`
          : `${label} của ${c.employee.fullName} sẽ hết hạn sau ${daysLeft} ngày.`;
      try {
        await this.notifications.dispatch({
          orgId: c.orgId,
          userIds: [...recipients],
          type: 'GENERAL',
          title: 'Hợp đồng sắp hết hạn',
          body,
          link: '/dashboard/contracts',
        });
      } catch (err) {
        this.logger.warn(`Nhắc HĐ ${c.id} lỗi: ${String(err)}`);
      }
    }
  }

  private async hrUserIds(orgId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: {
        role: { orgId, name: { in: [ORG_ROLES.ORG_ADMIN, ORG_ROLES.HR_MANAGER] } },
        user: { status: 'ACTIVE' },
      },
      select: { userId: true },
    });
    return [...new Set(rows.map((r) => r.userId))];
  }
}
