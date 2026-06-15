import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ERROR_CODES } from '@repo/shared';
import type Redis from 'ioredis';
import { AppException } from '../../common/exceptions/app.exception';
import { generateStateToken } from '../../common/utils/crypto';
import { AppConfigService } from '../../config/app-config.service';
import type { User } from '../../prisma/prisma.types';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.module';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STATE_TTL_SECONDS = 600;

interface GoogleIdTokenClaims {
  iss: string;
  aud: string;
  exp: number;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * OAuth 2.0 Authorization Code flow thủ công (không passport):
 * state lưu Redis 10 phút chống CSRF, đổi code lấy token qua fetch.
 * id_token nhận trực tiếp từ token endpoint của Google qua TLS nên decode
 * payload + validate claims là đủ, không cần verify chữ ký JWKS.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private requireConfig() {
    const google = this.config.google;
    if (!google) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Google OAuth chưa được cấu hình',
        ERROR_CODES.AUTH_OAUTH_FAILED,
      );
    }
    return google;
  }

  async buildAuthUrl(): Promise<string> {
    const google = this.requireConfig();
    const state = generateStateToken();
    await this.redis.set(`oauth:state:${state}`, '1', 'EX', STATE_TTL_SECONDS);

    const params = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: google.callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /** Verify state + đổi code lấy id_token + upsert OAuthAccount/User. */
  async handleCallback(code: string, state: string): Promise<User> {
    const google = this.requireConfig();

    const stateValid = await this.redis.getdel(`oauth:state:${state}`);
    if (!stateValid) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'State OAuth không hợp lệ hoặc đã hết hạn',
        ERROR_CODES.AUTH_OAUTH_STATE_INVALID,
      );
    }

    const claims = await this.exchangeCode(code, google);
    return this.upsertUser(claims);
  }

  private async exchangeCode(
    code: string,
    google: { clientId: string; clientSecret: string; callbackUrl: string },
  ): Promise<GoogleIdTokenClaims> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: google.clientId,
        client_secret: google.clientSecret,
        redirect_uri: google.callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      this.logger.warn(`Google token endpoint trả ${response.status}`);
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'Không đổi được authorization code với Google',
        ERROR_CODES.AUTH_OAUTH_FAILED,
      );
    }

    const data = (await response.json()) as { id_token?: string };
    if (!data.id_token) {
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'Google không trả về id_token',
        ERROR_CODES.AUTH_OAUTH_FAILED,
      );
    }

    const claims = this.decodeIdToken(data.id_token);
    const issuerValid =
      claims.iss === 'https://accounts.google.com' ||
      claims.iss === 'accounts.google.com';
    if (
      !issuerValid ||
      claims.aud !== google.clientId ||
      claims.exp * 1_000 < Date.now() ||
      !claims.sub ||
      !claims.email
    ) {
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'id_token của Google không hợp lệ',
        ERROR_CODES.AUTH_OAUTH_FAILED,
      );
    }

    return claims;
  }

  private decodeIdToken(idToken: string): GoogleIdTokenClaims {
    const payload = idToken.split('.')[1];
    if (!payload) {
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'id_token sai định dạng',
        ERROR_CODES.AUTH_OAUTH_FAILED,
      );
    }
    return JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as GoogleIdTokenClaims;
  }

  private async upsertUser(claims: GoogleIdTokenClaims): Promise<User> {
    const email = claims.email!.toLowerCase();

    const account = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'GOOGLE',
          providerAccountId: claims.sub,
        },
      },
      include: { user: true },
    });
    if (account) return account.user;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      // Chỉ link theo email khi email đã được xác thực (phía mình hoặc Google)
      if (!existingUser.emailVerifiedAt && !claims.email_verified) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'Email chưa được xác thực, không thể liên kết tài khoản Google',
          ERROR_CODES.AUTH_OAUTH_FAILED,
        );
      }
      const [, user] = await this.prisma.$transaction([
        this.prisma.oAuthAccount.create({
          data: {
            userId: existingUser.id,
            provider: 'GOOGLE',
            providerAccountId: claims.sub,
            email,
          },
        }),
        this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
            avatarUrl: existingUser.avatarUrl ?? claims.picture ?? null,
          },
        }),
      ]);
      return user;
    }

    return this.prisma.user.create({
      data: {
        email,
        name: claims.name ?? email.split('@')[0] ?? 'Người dùng Google',
        avatarUrl: claims.picture ?? null,
        emailVerifiedAt: claims.email_verified ? new Date() : null,
        oauthAccounts: {
          create: { provider: 'GOOGLE', providerAccountId: claims.sub, email },
        },
      },
    });
  }
}
