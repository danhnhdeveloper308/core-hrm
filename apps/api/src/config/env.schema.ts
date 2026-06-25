import { z } from 'zod';

/** Chuỗi rỗng trong .env coi như không khai báo. */
const optionalString = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().optional(),
);

const durationString = z
  .string()
  .regex(/^\d+[smhd]$/, 'Format thời lượng: <số><s|m|h|d>, vd 15m, 30d');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(8001),
  API_GLOBAL_PREFIX: z.string().default('api'),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:3000'),
  COOKIE_DOMAIN: optionalString,
  /**
   * SameSite cho cookie auth. FE & BE KHÁC domain (vd Vercel + Railway) → 'none'
   * (kèm Secure, bắt buộc HTTPS). Cùng site/đảo ngược qua proxy → 'lax'.
   */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL bắt buộc'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: optionalString,
  /** Bật TLS khi dùng Redis serverless có yêu cầu mã hoá (vd Upstash). */
  REDIS_TLS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET tối thiểu 32 ký tự'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET tối thiểu 32 ký tự'),
  ACCESS_TOKEN_TTL: durationString.default('15m'),
  REFRESH_TOKEN_TTL: durationString.default('30d'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  TOTP_ISSUER: z.string().default('HRM'),
  /** 32 bytes hex — mã hoá AES-256-GCM cho totpSecret trong DB. */
  TOTP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOTP_ENCRYPTION_KEY phải là 64 ký tự hex (32 bytes)'),

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_CALLBACK_URL: optionalString,

  // Mail provider — ưu tiên: BREVO_API_KEY → SMTP (MAIL_HOST) → console (dev)
  BREVO_API_KEY: optionalString,
  MAIL_HOST: optionalString,
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MAIL_USER: optionalString,
  MAIL_PASS: optionalString,
  MAIL_FROM_NAME: z.string().default('App'),
  MAIL_FROM_ADDRESS: optionalString,

  NEXT_PUBLIC_APP_URL: z.url().default('http://localhost:3000'),

  // Object storage S3-compatible (dev: MinIO trong docker-compose)
  S3_ENDPOINT: z.string().min(1).default('http://localhost:9000'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1).default('hrm'),
  S3_ACCESS_KEY: z.string().min(1).default('minio'),
  S3_SECRET_KEY: z.string().min(1).default('minio_secret'),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Origin public thay cho S3_ENDPOINT trong signed URL (prod: https://DOMAIN/storage). */
  S3_PUBLIC_URL: optionalString,

  // Firebase Cloud Messaging (FCM) — push notification. Thiếu cả 3 → tắt push (chỉ in-app).
  FIREBASE_PROJECT_ID: optionalString,
  FIREBASE_CLIENT_EMAIL: optionalString,
  /** Private key service account — newline thường escape `\n` trong .env. */
  FIREBASE_PRIVATE_KEY: optionalString,

  // Face check-in 1:1 (@vladmandic/human)
  FACE_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.55),
  FACE_ANTISPOOF_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
  FACE_MODELS_PATH: z.string().default('./models'),
  /** Điểm chất lượng tối thiểu khi enroll (faceScore của human). */
  FACE_ENROLL_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.8),
});

export type Env = z.infer<typeof envSchema>;

/** Crash sớm khi thiếu/sai env — gọi bởi ConfigModule.forRoot({ validate }). */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Biến môi trường không hợp lệ:\n${issues}`);
  }
  return result.data;
}
