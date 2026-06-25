import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseDurationMs } from '../common/utils/duration';
import type { Env } from './env.schema';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

/** Wrapper typed quanh ConfigService — nơi duy nhất đọc env trong app. */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get isProd(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return this.config.get('API_PORT', { infer: true });
  }

  get globalPrefix(): string {
    return this.config.get('API_GLOBAL_PREFIX', { infer: true });
  }

  get corsOrigins(): string[] {
    return this.config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  get cookieDomain(): string | undefined {
    return this.config.get('COOKIE_DOMAIN', { infer: true });
  }

  get cookieSameSite(): 'lax' | 'strict' | 'none' {
    return this.config.get('COOKIE_SAMESITE', { infer: true });
  }

  get databaseUrl(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get redis(): {
    host: string;
    port: number;
    password: string | undefined;
    tls: boolean;
  } {
    return {
      host: this.config.get('REDIS_HOST', { infer: true }),
      port: this.config.get('REDIS_PORT', { infer: true }),
      password: this.config.get('REDIS_PASSWORD', { infer: true }),
      tls: this.config.get('REDIS_TLS', { infer: true }),
    };
  }

  get jwtAccessSecret(): string {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  get jwtRefreshSecret(): string {
    return this.config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  get accessTokenTtl(): string {
    return this.config.get('ACCESS_TOKEN_TTL', { infer: true });
  }

  get accessTokenTtlMs(): number {
    return parseDurationMs(this.accessTokenTtl);
  }

  get refreshTokenTtl(): string {
    return this.config.get('REFRESH_TOKEN_TTL', { infer: true });
  }

  get refreshTokenTtlMs(): number {
    return parseDurationMs(this.refreshTokenTtl);
  }

  get otpTtlSeconds(): number {
    return this.config.get('OTP_TTL_SECONDS', { infer: true });
  }

  get totpIssuer(): string {
    return this.config.get('TOTP_ISSUER', { infer: true });
  }

  get totpEncryptionKey(): string {
    return this.config.get('TOTP_ENCRYPTION_KEY', { infer: true });
  }

  /** null khi chưa cấu hình Google OAuth — endpoint liên quan trả 503. */
  get google(): GoogleOAuthConfig | null {
    const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET', { infer: true });
    const callbackUrl = this.config.get('GOOGLE_CALLBACK_URL', { infer: true });
    if (!clientId || !clientSecret || !callbackUrl) return null;
    return { clientId, clientSecret, callbackUrl };
  }

  /** URL frontend — đích redirect sau OAuth. */
  get appUrl(): string {
    return this.config.get('NEXT_PUBLIC_APP_URL', { infer: true });
  }

  /** null khi chưa có BREVO_API_KEY → fallback SMTP/console. */
  get brevo(): { apiKey: string; fromName: string; fromAddress: string } | null {
    const apiKey = this.config.get('BREVO_API_KEY', { infer: true });
    if (!apiKey) return null;
    return {
      apiKey,
      fromName: this.config.get('MAIL_FROM_NAME', { infer: true }),
      fromAddress:
        this.config.get('MAIL_FROM_ADDRESS', { infer: true }) ?? 'no-reply@localhost',
    };
  }

  /** null khi chưa cấu hình SMTP → dùng ConsoleMailProvider (dev). */
  get mail(): {
    host: string;
    port: number;
    secure: boolean;
    user: string | undefined;
    pass: string | undefined;
    fromName: string;
    fromAddress: string;
  } | null {
    const host = this.config.get('MAIL_HOST', { infer: true });
    if (!host) return null;
    return {
      host,
      port: this.config.get('MAIL_PORT', { infer: true }),
      secure: this.config.get('MAIL_SECURE', { infer: true }),
      user: this.config.get('MAIL_USER', { infer: true }),
      pass: this.config.get('MAIL_PASS', { infer: true }),
      fromName: this.config.get('MAIL_FROM_NAME', { infer: true }),
      fromAddress:
        this.config.get('MAIL_FROM_ADDRESS', { infer: true }) ?? 'no-reply@localhost',
    };
  }

  /** null khi chưa cấu hình đủ Firebase service account → tắt FCM push (chỉ in-app). */
  get firebaseAdmin(): {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  } | null {
    const projectId = this.config.get('FIREBASE_PROJECT_ID', { infer: true });
    const clientEmail = this.config.get('FIREBASE_CLIENT_EMAIL', { infer: true });
    const privateKey = this.config.get('FIREBASE_PRIVATE_KEY', { infer: true });
    if (!projectId || !clientEmail || !privateKey) return null;
    // .env lưu '\n' literal → khôi phục newline thật cho PEM
    return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') };
  }

  get face(): {
    matchThreshold: number;
    antispoofThreshold: number;
    modelsPath: string;
    enrollMinScore: number;
  } {
    return {
      matchThreshold: this.config.get('FACE_MATCH_THRESHOLD', { infer: true }),
      antispoofThreshold: this.config.get('FACE_ANTISPOOF_THRESHOLD', { infer: true }),
      modelsPath: this.config.get('FACE_MODELS_PATH', { infer: true }),
      enrollMinScore: this.config.get('FACE_ENROLL_MIN_SCORE', { infer: true }),
    };
  }

  get storage(): {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
    publicUrl: string | undefined;
  } {
    return {
      endpoint: this.config.get('S3_ENDPOINT', { infer: true }),
      region: this.config.get('S3_REGION', { infer: true }),
      bucket: this.config.get('S3_BUCKET', { infer: true }),
      accessKey: this.config.get('S3_ACCESS_KEY', { infer: true }),
      secretKey: this.config.get('S3_SECRET_KEY', { infer: true }),
      forcePathStyle: this.config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      publicUrl: this.config.get('S3_PUBLIC_URL', { infer: true }),
    };
  }
}
