import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ORG_ROLES } from '@repo/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

const MS_PER_DAY = 86_400_000;
/** Mốc nhắc trước khi hết hạn (ngày). Cron 1 lần/ngày → mỗi mốc nhắc 1 lần. */
const REMIND_DAYS = [60, 30, 7, 0];

/**
 * Nhắc chứng chỉ sắp hết hạn. Quét hàng ngày các chứng chỉ có expiryDate; ở các
 * mốc 60/30/7/0 ngày → báo nhân viên + HR (ORG_ADMIN/HR_MANAGER) qua Notification.
 */
@Injectable()
export class CertificationReminderService {
  private readonly logger = new Logger(CertificationReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async remind(): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const maxDays = Math.max(...REMIND_DAYS);
    const horizon = new Date(today.getTime() + maxDays * MS_PER_DAY);

    const certs = await this.prisma.certification.findMany({
      where: { expiryDate: { not: null, lte: horizon, gte: today } },
      select: {
        id: true,
        orgId: true,
        name: true,
        expiryDate: true,
        employee: { select: { fullName: true, userId: true } },
      },
    });
    if (certs.length === 0) return;

    const hrByOrg = new Map<string, string[]>();
    for (const orgId of new Set(certs.map((c) => c.orgId))) {
      hrByOrg.set(orgId, await this.hrUserIds(orgId));
    }

    for (const c of certs) {
      if (!c.expiryDate) continue;
      const end = new Date(c.expiryDate);
      end.setUTCHours(0, 0, 0, 0);
      const daysLeft = Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);
      if (!REMIND_DAYS.includes(daysLeft)) continue;

      const recipients = new Set<string>(hrByOrg.get(c.orgId) ?? []);
      if (c.employee.userId) recipients.add(c.employee.userId);
      if (recipients.size === 0) continue;

      const body =
        daysLeft === 0
          ? `Chứng chỉ "${c.name}" của ${c.employee.fullName} hết hạn HÔM NAY.`
          : `Chứng chỉ "${c.name}" của ${c.employee.fullName} sẽ hết hạn sau ${daysLeft} ngày.`;
      try {
        await this.notifications.dispatch({
          orgId: c.orgId,
          userIds: [...recipients],
          type: 'GENERAL',
          title: 'Chứng chỉ sắp hết hạn',
          body,
          link: '/dashboard/training',
        });
      } catch (err) {
        this.logger.warn(`Nhắc chứng chỉ ${c.id} lỗi: ${String(err)}`);
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
