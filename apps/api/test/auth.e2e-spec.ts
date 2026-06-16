/**
 * E2E auth flows: register → verify → login → refresh rotation → reuse
 * detection → logout; RBAC guard; revoke session.
 *
 * Yêu cầu: Postgres + Redis local đang chạy (pnpm db:up) và đã seed
 * (pnpm db:seed — cần SUPER_ADMIN từ SEED_ADMIN_*).
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  EmailQueueService,
  type SendOtpJobData,
} from '../src/queues/email.queue';

/** Stub queue: bắt OTP/link mời thay vì gửi mail — tránh phụ thuộc BullMQ async. */
class CapturingEmailQueue {
  readonly lastOtpByEmail = new Map<string, string>();
  readonly lastInviteLinkByEmail = new Map<string, string>();

  enqueueOtp(data: SendOtpJobData): Promise<void> {
    this.lastOtpByEmail.set(data.to, data.code);
    return Promise.resolve();
  }

  enqueueInvite(data: { to: string; link: string }): Promise<void> {
    this.lastInviteLinkByEmail.set(data.to, data.link);
    return Promise.resolve();
  }

  enqueueNewDeviceAlert(): Promise<void> {
    return Promise.resolve();
  }
}

const PREFIX = '/api';

function extractCookies(res: request.Response): Record<string, string> {
  const raw = res.headers['set-cookie'] as unknown as
    | string[]
    | string
    | undefined;
  const setCookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const result: Record<string, string> = {};
  for (const cookie of setCookies) {
    const [pair] = cookie.split(';');
    const eq = pair?.indexOf('=') ?? -1;
    if (pair && eq > 0) {
      result[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
  return result;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

describe('Auth flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emailQueue: CapturingEmailQueue;

  const email = `e2e-${Date.now()}@example.com`;
  const password = 'TestPass123';
  // Admin riêng cho test — không phụ thuộc trạng thái user seed (có thể đã bật 2FA)
  const adminEmail = `e2e-admin-${Date.now()}@example.com`;
  const adminPassword = 'AdminPass123';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    emailQueue = new CapturingEmailQueue();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailQueueService)
      .useValue(emailQueue)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
    prisma = app.get(PrismaService);

    const superAdminRole = await prisma.role.findFirstOrThrow({
      where: { name: 'SUPER_ADMIN', orgId: null },
    });
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'E2E Admin',
        passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: superAdminRole.id } },
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-' } } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('register → verify → login', () => {
    it('đăng ký trả message chung, không lộ email tồn tại', async () => {
      const res = await http()
        .post(`${PREFIX}/auth/register`)
        .send({ email, password, name: 'E2E Tester' })
        .expect(201);
      expect(res.body.message).toBeDefined();

      // Đăng ký lại cùng email → cùng message, không lộ gì
      const res2 = await http()
        .post(`${PREFIX}/auth/register`)
        .send({ email, password, name: 'E2E Tester' })
        .expect(201);
      expect(res2.body.message).toBe(res.body.message);
    });

    it('login trước khi verify → 403 AUTH_EMAIL_NOT_VERIFIED', async () => {
      const res = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: email, password })
        .expect(403);
      expect(res.body.errorCode).toBe('AUTH_EMAIL_NOT_VERIFIED');
    });

    it('OTP sai bị từ chối và đếm attempts', async () => {
      const res = await http()
        .post(`${PREFIX}/auth/verify-email`)
        .send({ email, code: '000000' })
        .expect(400);
      expect(res.body.errorCode).toBe('AUTH_OTP_INVALID');
    });

    it('verify đúng OTP → login thành công, set cookie httpOnly', async () => {
      const code = emailQueue.lastOtpByEmail.get(email);
      expect(code).toBeDefined();

      await http()
        .post(`${PREFIX}/auth/verify-email`)
        .send({ email, code })
        .expect(200);

      const res = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: email, password })
        .expect(200);

      expect(res.body.requires2fa).toBe(false);
      expect(res.body.user.email).toBe(email);
      // Không bao giờ lộ hash/secret
      expect(res.body.user.passwordHash).toBeUndefined();

      const cookies = extractCookies(res);
      expect(cookies['access_token']).toBeTruthy();
      expect(cookies['refresh_token']).toBeTruthy();
      const rawSetCookie = String(res.headers['set-cookie']);
      expect(rawSetCookie).toContain('HttpOnly');
    });

    it('sai mật khẩu và email không tồn tại trả cùng lỗi 401', async () => {
      const res1 = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: email, password: 'WrongPass123' })
        .expect(401);
      const res2 = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: 'khongtontai@example.com', password: 'WrongPass123' })
        .expect(401);
      expect(res1.body.errorCode).toBe('AUTH_INVALID_CREDENTIALS');
      expect(res1.body.message).toBe(res2.body.message);
    });
  });

  describe('refresh rotation + reuse detection', () => {
    let cookies: Record<string, string>;

    beforeAll(async () => {
      const res = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: email, password })
        .expect(200);
      cookies = extractCookies(res);
    });

    it('refresh hợp lệ → cấp cặp token mới (rotation)', async () => {
      const res = await http()
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', cookieHeader(cookies))
        .expect(200);

      const newCookies = extractCookies(res);
      expect(newCookies['refresh_token']).toBeTruthy();
      expect(newCookies['refresh_token']).not.toBe(cookies['refresh_token']);

      // refresh token CŨ giờ đã bị revoke (ROTATED) — giữ lại để test reuse
      const oldCookies = cookies;
      cookies = newCookies;

      // Dùng lại token cũ → reuse detection → revoke TẤT CẢ
      const reuse = await http()
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', cookieHeader(oldCookies))
        .expect(401);
      expect(reuse.body.errorCode).toBe('AUTH_TOKEN_REUSE');

      // Token mới (vừa cấp) cũng chết vì revoke-all
      await http()
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', cookieHeader(cookies))
        .expect(401);
    });

    it('logout revoke session và refresh sau đó fail', async () => {
      const login = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: email, password })
        .expect(200);
      const c = extractCookies(login);

      await http()
        .post(`${PREFIX}/auth/logout`)
        .set('Cookie', cookieHeader(c))
        .expect(200);

      await http()
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', cookieHeader(c))
        .expect(401);
    });
  });

  describe('RBAC guard', () => {
    it('user thường bị 403 khi GET /users (thiếu user:read)', async () => {
      const login = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: email, password })
        .expect(200);

      const res = await http()
        .get(`${PREFIX}/users`)
        .set('Cookie', cookieHeader(extractCookies(login)))
        .expect(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
      expect(res.body.details.missing).toContain('user:read');
    });

    it('chưa đăng nhập → 401', async () => {
      const res = await http().get(`${PREFIX}/users`).expect(401);
      expect(res.body.errorCode).toBe('AUTH_UNAUTHENTICATED');
    });

    it('SUPER_ADMIN truy cập được /users và /audit', async () => {
      const login = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: adminEmail, password: adminPassword })
        .expect(200);
      const header = cookieHeader(extractCookies(login));

      const users = await http()
        .get(`${PREFIX}/users?limit=5`)
        .set('Cookie', header)
        .expect(200);
      expect(users.body.items.length).toBeGreaterThan(0);
      expect(users.body.meta.total).toBeGreaterThan(0);

      const audit = await http()
        .get(`${PREFIX}/audit?limit=5`)
        .set('Cookie', header)
        .expect(200);
      expect(Array.isArray(audit.body.items)).toBe(true);
    });
  });

  describe('account lockout (per-email)', () => {
    it('khoá 15 phút sau 10 lần sai — kể cả email không tồn tại', async () => {
      const lockEmail = `e2e-lock-${Date.now()}@example.com`;

      for (let i = 0; i < 10; i++) {
        await http()
          .post(`${PREFIX}/auth/login`)
          .send({ identifier: lockEmail, password: 'WrongPass1' })
          .expect(401);
      }

      const locked = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: lockEmail, password: 'WrongPass1' })
        .expect(429);
      expect(locked.body.errorCode).toBe('AUTH_ACCOUNT_LOCKED');
    });
  });

  describe('invite flow', () => {
    const inviteeEmail = `e2e-invite-${Date.now()}@example.com`;
    const inviteePassword = 'InvitePass123';

    it('admin mời → user đặt mật khẩu qua link → đăng nhập được', async () => {
      const adminLogin = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: adminEmail, password: adminPassword })
        .expect(200);

      const invited = await http()
        .post(`${PREFIX}/users/invite`)
        .set('Cookie', cookieHeader(extractCookies(adminLogin)))
        .send({ email: inviteeEmail, name: 'E2E Invitee' })
        .expect(201);
      expect(invited.body.email).toBe(inviteeEmail);
      expect(invited.body.roles.map((r: { name: string }) => r.name)).toContain(
        'USER',
      );

      const link = emailQueue.lastInviteLinkByEmail.get(inviteeEmail);
      expect(link).toBeDefined();
      const token = new URL(link!).searchParams.get('token');
      expect(token).toBeTruthy();

      // Đặt mật khẩu + auto-login (set cookie)
      const accept = await http()
        .post(`${PREFIX}/auth/accept-invite`)
        .send({ email: inviteeEmail, token, password: inviteePassword })
        .expect(200);
      expect(accept.body.requires2fa).toBe(false);
      expect(extractCookies(accept)['access_token']).toBeTruthy();

      // Token chỉ dùng 1 lần
      await http()
        .post(`${PREFIX}/auth/accept-invite`)
        .send({ email: inviteeEmail, token, password: inviteePassword })
        .expect(400);

      // Đăng nhập bằng mật khẩu vừa đặt
      await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: inviteeEmail, password: inviteePassword })
        .expect(200);
    });
  });

  describe('2FA + trusted device', () => {
    it('bật 2FA → verify kèm rememberDevice → lần sau login skip 2FA', async () => {
      const { generate } = await import('otplib');

      // Bật 2FA cho user test
      const login = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: email, password })
        .expect(200);
      const header = cookieHeader(extractCookies(login));

      const setup = await http()
        .post(`${PREFIX}/auth/2fa/setup`)
        .set('Cookie', header)
        .expect(201);
      const secret: string = setup.body.secret;

      const enable = await http()
        .post(`${PREFIX}/auth/2fa/enable`)
        .set('Cookie', header)
        .send({ code: await generate({ secret }) })
        .expect(200);
      expect(enable.body.recoveryCodes).toHaveLength(8);

      // Login → yêu cầu 2FA
      const step1 = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: email, password })
        .expect(200);
      expect(step1.body.requires2fa).toBe(true);

      // Verify kèm rememberDevice → nhận cookie trusted_device
      const step2 = await http()
        .post(`${PREFIX}/auth/2fa/verify`)
        .send({
          pendingToken: step1.body.pending2faToken,
          code: await generate({ secret }),
          rememberDevice: true,
        })
        .expect(200);
      const trustedCookie = extractCookies(step2)['trusted_device'];
      expect(trustedCookie).toBeTruthy();

      // Login lần sau KÈM cookie trusted_device → skip thẳng 2FA
      const direct = await http()
        .post(`${PREFIX}/auth/login`)
        .set('Cookie', `trusted_device=${trustedCookie}`)
        .send({ identifier: email, password })
        .expect(200);
      expect(direct.body.requires2fa).toBe(false);

      // Không có cookie → vẫn đòi 2FA
      const noCookie = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: email, password })
        .expect(200);
      expect(noCookie.body.requires2fa).toBe(true);

      // Tắt 2FA (dọn dẹp) → thiết bị tin cậy bị thu hồi
      const cleanup = await http()
        .post(`${PREFIX}/auth/login`)
        .set('Cookie', `trusted_device=${trustedCookie}`)
        .send({ identifier: email, password })
        .expect(200);
      await http()
        .post(`${PREFIX}/auth/2fa/disable`)
        .set('Cookie', cookieHeader(extractCookies(cleanup)))
        .send({ password })
        .expect(200);
    });
  });

  describe('revoke session', () => {
    it('revoke session khác qua DELETE /sessions/:id', async () => {
      // 2 phiên song song
      const loginA = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: email, password })
        .expect(200);
      const loginB = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ identifier: email, password })
        .expect(200);

      const headerA = cookieHeader(extractCookies(loginA));

      const before = await http()
        .get(`${PREFIX}/sessions/me`)
        .set('Cookie', headerA)
        .expect(200);
      const other = before.body.find(
        (s: { isCurrent: boolean }) => !s.isCurrent,
      );
      expect(other).toBeDefined();

      await http()
        .delete(`${PREFIX}/sessions/${other.id}`)
        .set('Cookie', headerA)
        .expect(200);

      // Phiên B đã chết: refresh fail
      await http()
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', cookieHeader(extractCookies(loginB)))
        .expect(401);

      // ACCESS token của B cũng bị chặn NGAY (Redis blocklist),
      // không cần đợi 15 phút JWT hết hạn
      const blocked = await http()
        .get(`${PREFIX}/auth/me`)
        .set('Cookie', cookieHeader(extractCookies(loginB)))
        .expect(401);
      expect(blocked.body.errorCode).toBe('AUTH_SESSION_REVOKED');

      const after = await http()
        .get(`${PREFIX}/sessions/me`)
        .set('Cookie', headerA)
        .expect(200);
      expect(after.body.map((s: { id: string }) => s.id)).not.toContain(other.id);
    });
  });
});
