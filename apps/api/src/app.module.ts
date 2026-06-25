import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { ActivityInterceptor } from './common/interceptors/activity.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { HttpLoggerMiddleware } from './common/middleware/http-logger.middleware';
import { AppConfigModule } from './config/config.module';
import { GatewaysModule } from './gateways/gateways.module';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { AuditModule } from './modules/audit/audit.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuthModule } from './modules/auth/auth.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { AttachmentModule } from './modules/attachment/attachment.module';
import { ShiftRegistrationModule } from './modules/shift-registration/shift-registration.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { FaceModule } from './modules/face/face.module';
import { LeaveModule } from './modules/leave/leave.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OrgStructureModule } from './modules/org-structure/org-structure.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RolesModule } from './modules/roles/roles.module';
import { WorkScheduleModule } from './modules/schedule/schedule.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditQueueModule } from './queues/audit.queue';
import { TimesheetQueueModule } from './queues/timesheet.queue';
import { EmailQueueModule } from './queues/email.queue';
import { NotificationQueueModule } from './queues/notification.queue';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    // Mặc định rộng rãi cho toàn API; auth endpoints có @Throttle chặt hơn
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      // e2e test gọi auth endpoints dồn dập — bỏ throttle khi NODE_ENV=test
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    // Secret/expiry truyền theo từng lần sign trong TokenService
    JwtModule.register({ global: true }),
    MailModule,
    StorageModule,
    EmailQueueModule,
    AuditQueueModule,
    TimesheetQueueModule,
    NotificationQueueModule,
    RbacModule,
    SessionsModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    AuditModule,
    OrganizationsModule,
    OrgStructureModule,
    EmployeesModule,
    WorkScheduleModule,
    AttendanceModule,
    FaceModule,
    ApprovalModule,
    AttachmentModule,
    ShiftRegistrationModule,
    LeaveModule,
    NotificationModule,
    ReportsModule,
    GatewaysModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpLoggerMiddleware).forRoutes('{*splat}');
  }
}
