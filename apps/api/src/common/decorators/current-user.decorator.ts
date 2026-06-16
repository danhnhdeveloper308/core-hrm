import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Payload access token đã verify — gắn vào req.user bởi JwtAuthGuard. */
export interface AccessTokenPayload {
  /** userId */
  sub: string;
  /** Null với nhân viên không có email (đăng nhập bằng username). */
  email: string | null;
  /** Null = platform admin (không thuộc tenant nào). */
  orgId: string | null;
  sessionId: string;
  typ: 'access';
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as AccessTokenPayload;
  },
);
