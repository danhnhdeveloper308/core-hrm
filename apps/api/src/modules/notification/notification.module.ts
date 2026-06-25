import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

/**
 * Notification center (Phase 8): in-app (DB + socket) + FCM push.
 * NotificationPushQueueService đến từ NotificationQueueModule (@Global).
 * Export NotificationService để module nghiệp vụ (approval...) gọi dispatch.
 */
@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
