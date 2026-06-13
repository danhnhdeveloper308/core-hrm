import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Chạy SAU JwtAuthGuard: gắn `request.orgId` từ access token payload.
 * Không chặn gì ở đây — route cần org context dùng @CurrentOrg() (throw khi
 * thiếu); service nhận orgId qua tham số đầu tiên, scope tường minh từng query.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request>();
    request.orgId = request.user?.orgId ?? null;
    return true;
  }
}
