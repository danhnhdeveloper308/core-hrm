import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, type Permission } from '@repo/shared';
import type { Request } from 'express';
import { PermissionsCacheService } from '../../modules/rbac/permissions-cache.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AppException } from '../exceptions/app.exception';

/**
 * Kiểm tra @RequirePermissions(...) — load qua cache Redis 60s.
 * Chạy SAU JwtAuthGuard (req.user đã có). Route không khai báo
 * @RequirePermissions thì bỏ qua.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: PermissionsCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Chưa đăng nhập',
        ERROR_CODES.AUTH_UNAUTHENTICATED,
      );
    }

    const access = await this.cache.getUserAccess(user.sub);
    if (!access || access.status !== 'ACTIVE') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Tài khoản không còn hoạt động',
        ERROR_CODES.AUTH_USER_BANNED,
      );
    }

    const missing = required.filter((p) => !access.permissions.includes(p));
    if (missing.length > 0) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Không đủ quyền thực hiện thao tác này',
        ERROR_CODES.FORBIDDEN,
        { missing },
      );
    }

    return true;
  }
}
