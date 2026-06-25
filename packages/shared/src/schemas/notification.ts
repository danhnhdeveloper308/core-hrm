import { z } from 'zod';

export const notificationTypeSchema = z.enum([
  'APPROVAL_PENDING',
  'APPROVAL_DECIDED',
  'GENERAL',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/** 1 thông báo in-app (response). */
export const notificationSchema = z.object({
  id: z.uuid(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

/** Cursor pagination cho danh sách thông báo + có thể lọc chưa đọc. */
export const notificationListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const unreadCountSchema = z.object({ count: z.number().int() });
export type UnreadCount = z.infer<typeof unreadCountSchema>;

/** Đăng ký FCM token của thiết bị hiện tại. */
export const registerDeviceTokenSchema = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(['web', 'android', 'ios']).default('web'),
});
export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;

/** Gỡ FCM token (khi logout hoặc tắt thông báo). */
export const removeDeviceTokenSchema = z.object({
  token: z.string().min(1).max(4096),
});
export type RemoveDeviceTokenInput = z.infer<typeof removeDeviceTokenSchema>;

// ===== Tuỳ chọn nhận thông báo (per-user, loại × kênh) =====

/** Kênh nhận: in-app (chuông), email, push (FCM/OS). */
export const NOTIFICATION_CHANNELS = ['inApp', 'email', 'push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

const channelPrefSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  push: z.boolean(),
});

/** Ma trận đầy đủ: mỗi loại thông báo → bật/tắt từng kênh. */
export const notificationPrefsSchema = z.object({
  APPROVAL_PENDING: channelPrefSchema,
  APPROVAL_DECIDED: channelPrefSchema,
  GENERAL: channelPrefSchema,
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

/** Mặc định: bật tất cả kênh cho mọi loại. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  APPROVAL_PENDING: { inApp: true, email: true, push: true },
  APPROVAL_DECIDED: { inApp: true, email: true, push: true },
  GENERAL: { inApp: true, email: true, push: true },
};

/** Hợp nhất giá trị lưu (có thể null/thiếu) với mặc định → ma trận đầy đủ. */
export function resolveNotificationPrefs(raw: unknown): NotificationPrefs {
  const parsed = notificationPrefsSchema.partial().safeParse(raw);
  const stored = parsed.success ? parsed.data : {};
  const merge = (t: NotificationType) => ({
    ...DEFAULT_NOTIFICATION_PREFS[t],
    ...(stored[t] ?? {}),
  });
  return {
    APPROVAL_PENDING: merge('APPROVAL_PENDING'),
    APPROVAL_DECIDED: merge('APPROVAL_DECIDED'),
    GENERAL: merge('GENERAL'),
  };
}
