import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ERROR_CODES } from '@repo/shared';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import { AppConfigService } from '../../config/app-config.service';

interface Pending2faPayload {
  sub: string;
  typ: '2fa';
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  /** Access JWT 15m — KHÔNG nhúng permissions (tránh stale). */
  signAccessToken(
    user: { id: string; email: string; orgId: string | null },
    sessionId: string,
  ): Promise<string> {
    const payload: Omit<AccessTokenPayload, 'typ'> & { typ: 'access' } = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
      sessionId,
      typ: 'access',
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.jwtAccessSecret,
      // tính bằng giây — tránh lệch type StringValue của jsonwebtoken
      expiresIn: Math.floor(this.config.accessTokenTtlMs / 1_000),
    });
  }

  /** Token tạm 5 phút cho bước 2 của login khi user bật 2FA — scope riêng. */
  signPending2faToken(userId: string): Promise<string> {
    const payload: Pending2faPayload = { sub: userId, typ: '2fa' };
    return this.jwt.signAsync(payload, {
      secret: this.config.jwtAccessSecret,
      expiresIn: 5 * 60,
    });
  }

  async verifyPending2faToken(token: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<Pending2faPayload>(token, {
        secret: this.config.jwtAccessSecret,
      });
      if (payload.typ !== '2fa') throw new Error('wrong token type');
      return payload.sub;
    } catch {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Phiên xác thực 2FA đã hết hạn, vui lòng đăng nhập lại',
        ERROR_CODES.AUTH_2FA_REQUIRED,
      );
    }
  }
}
