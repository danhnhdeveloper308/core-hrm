import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ERROR_CODES,
  resolveNotificationPrefs,
  type CursorPaginated,
  type Notification as NotificationDto,
  type NotificationListQuery,
  type NotificationPrefs,
  type NotificationType,
  type RegisterDeviceTokenInput,
} from '@repo/shared';
import { APP_EVENTS, type NotifyEvent } from '../../common/events/app.events';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import type { Notification } from '../../prisma/prisma.types';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailQueueService } from '../../queues/email.queue';
import { NotificationPushQueueService } from '../../queues/notification.queue';

export function toNotificationResponse(n: Notification): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    data: (n.data as Record<string, unknown> | null) ?? null,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

export interface DispatchParams {
  orgId: string | null;
  /** Người nhận (User.id). Trùng nhau sẽ tự loại; rỗng → no-op. */
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  data?: Record<string, unknown> | null;
  /** Gửi kèm email cho người nhận có địa chỉ email (mặc định true). */
  email?: boolean;
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly push: NotificationPushQueueService,
    private readonly email: EmailQueueService,
  ) {}

  /**
   * Tạo thông báo cho từng user theo TUỲ CHỌN của họ (loại × kênh):
   * - inApp → tạo row + emit socket `notification:new`
   * - push  → gửi FCM tới token của user bật push
   * - email → enqueue email (nếu có địa chỉ + đang ACTIVE)
   * Idempotency là trách nhiệm của caller (mỗi sự kiện gọi 1 lần).
   */
  async dispatch(params: DispatchParams): Promise<void> {
    const userIds = [...new Set(params.userIds)].filter(Boolean);
    if (userIds.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, status: true, notificationPrefs: true },
    });
    const prefById = new Map<string, NotificationPrefs>(
      users.map((u) => [u.id, resolveNotificationPrefs(u.notificationPrefs)]),
    );
    const allows = (userId: string, channel: 'inApp' | 'email' | 'push') =>
      prefById.get(userId)?.[params.type][channel] ?? false;

    // In-app: chỉ tạo row + socket cho user bật kênh inApp
    for (const userId of userIds) {
      if (!allows(userId, 'inApp')) continue;
      const row = await this.prisma.notification.create({
        data: {
          orgId: params.orgId,
          userId,
          type: params.type,
          title: params.title,
          body: params.body,
          link: params.link ?? null,
          data: (params.data as Prisma.InputJsonValue | undefined) ?? undefined,
        },
      });
      this.events.emit(APP_EVENTS.NOTIFY, {
        userId,
        notification: toNotificationResponse(row),
      } satisfies NotifyEvent);
    }

    // FCM push: token của user bật kênh push
    const pushUserIds = userIds.filter((id) => allows(id, 'push'));
    if (pushUserIds.length > 0) {
      const tokens = await this.prisma.deviceToken.findMany({
        where: { userId: { in: pushUserIds } },
        select: { token: true },
      });
      if (tokens.length > 0) {
        await this.push.enqueue({
          tokens: tokens.map((t) => t.token),
          title: params.title,
          body: params.body,
          link: params.link ?? null,
          data: { type: params.type, ...(params.link ? { link: params.link } : {}) },
        });
      }
    }

    // Email: user ACTIVE, có email, bật kênh email
    if (params.email !== false) {
      for (const u of users) {
        if (u.status === 'ACTIVE' && u.email && allows(u.id, 'email')) {
          await this.email.enqueueNotification({
            to: u.email,
            title: params.title,
            body: params.body,
            link: params.link ?? null,
          });
        }
      }
    }
  }

  // ===== Tuỳ chọn nhận thông báo =====

  async getPreferences(userId: string): Promise<NotificationPrefs> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    return resolveNotificationPrefs(user?.notificationPrefs);
  }

  async updatePreferences(
    userId: string,
    prefs: NotificationPrefs,
  ): Promise<NotificationPrefs> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { notificationPrefs: prefs as unknown as Prisma.InputJsonValue },
    });
    return resolveNotificationPrefs(prefs);
  }

  // ===== Đọc / đánh dấu =====

  async list(
    userId: string,
    query: NotificationListQuery,
  ): Promise<CursorPaginated<NotificationDto>> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };
    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: items.map(toNotificationResponse),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<{ count: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (res.count === 0) {
      // Không tồn tại / không thuộc user / đã đọc → 404 cho rõ ràng
      const exists = await this.prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!exists) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'Không tìm thấy thông báo',
          ERROR_CODES.NOT_FOUND,
        );
      }
    }
    return { count: res.count };
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: res.count };
  }

  // ===== FCM device token =====

  async registerToken(
    userId: string,
    input: RegisterDeviceTokenInput,
    userAgent: string | null,
  ): Promise<{ message: string }> {
    // Token có thể đã thuộc thiết bị/user khác (đăng nhập lại) → upsert về user hiện tại
    await this.prisma.deviceToken.upsert({
      where: { token: input.token },
      update: { userId, platform: input.platform, userAgent, lastSeenAt: new Date() },
      create: { userId, token: input.token, platform: input.platform, userAgent },
    });
    return { message: 'Đã đăng ký nhận thông báo đẩy' };
  }

  async removeToken(userId: string, token: string): Promise<{ message: string }> {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId } });
    return { message: 'Đã tắt thông báo đẩy trên thiết bị này' };
  }
}
