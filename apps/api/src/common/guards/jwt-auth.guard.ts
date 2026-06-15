import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ERROR_CODES } from '@repo/shared';
import type { Request } from 'express';
import type Redis from 'ioredis';
import type { AccessTokenPayload } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../exceptions/app.exception';
import { AppConfigService } from '../../config/app-config.service';
import { REDIS_CLIENT } from '../../redis/redis.module';

/**
 * Guard global: đọc cookie `access_token` trước, fallback Bearer header
 * (Swagger/mobile). Route đánh dấu @Public() được bỏ qua.
 * Sau khi verify JWT còn check Redis blocklist `revoked:{sessionId}` —
 * phiên bị thu hồi mất hiệu lực NGAY thay vì đợi access token hết hạn.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Gateway tự auth ở handshake (Phase 5)
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Chưa đăng nhập',
        ERROR_CODES.AUTH_UNAUTHENTICATED,
      );
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwtAccessSecret,
      });
      if (payload.typ !== 'access') throw new Error('wrong token type');
    } catch {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
        ERROR_CODES.AUTH_UNAUTHENTICATED,
      );
    }

    if (await this.isSessionRevoked(payload.sessionId)) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Phiên đăng nhập đã bị thu hồi',
        ERROR_CODES.AUTH_SESSION_REVOKED,
      );
    }

    request.user = payload;
    return true;
  }

  private async isSessionRevoked(sessionId: string): Promise<boolean> {
    try {
      return (await this.redis.exists(`revoked:${sessionId}`)) === 1;
    } catch (error) {
      // Redis lỗi → fail-open: không chặn toàn bộ API chỉ vì blocklist
      this.logger.warn(`Bỏ qua check blocklist session: ${String(error)}`);
      return false;
    }
  }

  private extractToken(request: Request): string | undefined {
    const cookieToken = (request.cookies as Record<string, string> | undefined)?.[
      'access_token'
    ];
    if (cookieToken) return cookieToken;

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    return undefined;
  }
}
