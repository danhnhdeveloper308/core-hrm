import {
  notificationListQuerySchema,
  notificationPrefsSchema,
  registerDeviceTokenSchema,
  removeDeviceTokenSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class NotificationListQueryDto extends createZodDto(
  notificationListQuerySchema,
) {}
export class RegisterDeviceTokenDto extends createZodDto(registerDeviceTokenSchema) {}
export class RemoveDeviceTokenDto extends createZodDto(removeDeviceTokenSchema) {}
export class NotificationPrefsDto extends createZodDto(notificationPrefsSchema) {}
