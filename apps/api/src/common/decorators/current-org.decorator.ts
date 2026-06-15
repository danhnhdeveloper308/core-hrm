import {
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { ERROR_CODES } from '@repo/shared';
import type { Request } from 'express';
import { AppException } from '../exceptions/app.exception';

/**
 * orgId của user hiện tại (gắn bởi TenantGuard). Route nghiệp vụ org-scoped
 * dùng decorator này — platform admin (orgId=null) gọi sẽ bị 403 rõ ràng.
 */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const orgId = request.orgId;
    if (!orgId) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Tài khoản không thuộc tổ chức nào — thao tác này cần ngữ cảnh tổ chức',
        ERROR_CODES.ORG_CONTEXT_REQUIRED,
      );
    }
    return orgId;
  },
);
