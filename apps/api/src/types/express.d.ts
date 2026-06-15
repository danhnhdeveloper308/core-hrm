import type { AccessTokenPayload } from '../common/decorators/current-user.decorator';

declare global {
  namespace Express {
    interface Request {
      /** Gắn bởi JwtAuthGuard sau khi verify access token. */
      user?: AccessTokenPayload;
      /** Gắn bởi TenantGuard — orgId của user hiện tại (null = platform admin). */
      orgId?: string | null;
    }
  }
}

export {};
