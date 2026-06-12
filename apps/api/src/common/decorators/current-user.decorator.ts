import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Payload access token đã verify — gắn vào req.user bởi JwtAuthGuard. */
export interface AccessTokenPayload {
  /** userId */
  sub: string;
  email: string;
  sessionId: string;
  typ: 'access';
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as AccessTokenPayload;
  },
);
