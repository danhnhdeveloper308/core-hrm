import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { auditStorage, type AuditContextStore } from '../audit/audit-context';
import { AUDIT_ACTION_KEY } from '../decorators/audit.decorator';
import { SKIP_AUDIT_KEY } from '../decorators/skip-audit.decorator';
import {
  APP_EVENTS,
  type AuditRecordEvent,
} from '../events/app.events';
import { redactSensitive } from '../utils/redact';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Tự ghi audit cho mọi request mutation thành công:
 * - action lấy từ @Audit('resource.action') — route mutation thiếu khai báo
 *   (và không @SkipAudit) sẽ bị log warning.
 * - Mở AsyncLocalStorage để service đính diff qua addAuditMetadata().
 * - Ghi qua BullMQ queue `audit` — không block request.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);
  private readonly warned = new Set<string>();

  constructor(
    private readonly reflector: Reflector,
    private readonly events: EventEmitter2,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    if (!MUTATION_METHODS.has(request.method)) return next.handle();

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const action = this.reflector.getAllAndOverride<string | undefined>(
      AUDIT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!action) {
      const route = `${request.method} ${request.route?.path ?? request.originalUrl}`;
      if (!this.warned.has(route)) {
        this.warned.add(route);
        this.logger.warn(
          `Route mutation thiếu @Audit(): ${route} — sẽ không được ghi audit log`,
        );
      }
      return next.handle();
    }

    const store: AuditContextStore = { metadata: {} };

    // Bọc subscribe trong als.run để context giữ nguyên suốt handler async
    return new Observable((subscriber) => {
      const subscription = auditStorage.run(store, () =>
        next
          .handle()
          .pipe(tap({ next: () => this.record(request, action, store) }))
          .subscribe(subscriber),
      );
      return () => subscription.unsubscribe();
    });
  }

  private record(
    request: Request,
    action: string,
    store: AuditContextStore,
  ): void {
    const params = request.params as Record<string, string | undefined>;
    const event: AuditRecordEvent = {
      actorId: request.user?.sub ?? null,
      actorEmail: request.user?.email ?? null,
      action,
      resource: action.split('.', 1)[0] ?? action,
      resourceId: params['id'] ?? params['userId'] ?? null,
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      metadata: {
        ...(Object.keys(store.metadata).length > 0 ? store.metadata : {}),
        ...(request.body && Object.keys(request.body as object).length > 0
          ? { body: redactSensitive(request.body) }
          : {}),
      },
    };
    this.events.emit(APP_EVENTS.AUDIT_RECORD, event);
  }
}
