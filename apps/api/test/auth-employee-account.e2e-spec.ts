/**
 * E2E — Tạo nhân viên KHÔNG email → tài khoản đăng nhập bằng mã NV + mật khẩu
 * mặc định; quên mật khẩu qua mã NV + SĐT. (Cụm Auth/User overhaul)
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEFAULT_EMPLOYEE_PASSWORD, ORG_ROLES } from '@repo/shared';
import argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailQueueService } from '../src/queues/email.queue';

class StubEmailQueue {
  enqueueOtp() { return Promise.resolve(); }
  enqueueInvite() { return Promise.resolve(); }
  enqueueNewDeviceAlert() { return Promise.resolve(); }
}

const PREFIX = '/api';

function cookieOf(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.map((c) => c.split(';')[0]).filter((p): p is string => !!p && p.includes('=')).join('; ');
}

describe('Auth — tài khoản nhân viên không email (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminPassword = 'AdminPass123';
  let orgId: string;
  let hrCookie: string;
  const empCode = `CN${stamp}`;
  const empPhone = '0911222333';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailQueueService)
      .useValue(new StubEmailQueue())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
    prisma = app.get(PrismaService);

    const org = await prisma.organization.create({
      data: { name: `Org Acc ${stamp}`, slug: `e2e-acc-${stamp}` },
    });
    orgId = org.id;
    const perms = await prisma.permission.findMany();
    const permByName = new Map(perms.map((p) => [p.name, p.id]));
    const { DEFAULT_ORG_ROLE_PERMISSIONS, ORG_ROLE_DESCRIPTIONS, ALL_ORG_ROLES } =
      await import('@repo/shared');
    for (const roleName of ALL_ORG_ROLES) {
      const role = await prisma.role.create({
        data: { name: roleName, description: ORG_ROLE_DESCRIPTIONS[roleName], isSystem: true, orgId },
      });
      await prisma.rolePermission.createMany({
        data: DEFAULT_ORG_ROLE_PERMISSIONS[roleName].map((p) => ({
          roleId: role.id,
          permissionId: permByName.get(p)!,
        })),
      });
    }
    const hrRole = await prisma.role.findFirstOrThrow({ where: { orgId, name: ORG_ROLES.HR_MANAGER } });
    const hrUser = await prisma.user.create({
      data: {
        email: `hr-acc-${stamp}@e2e.vn`,
        name: 'HR',
        passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        orgId,
        roles: { create: { roleId: hrRole.id } },
      },
    });
    void hrUser;
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/auth/login`)
      .send({ identifier: `hr-acc-${stamp}@e2e.vn`, password: adminPassword })
      .expect(200);
    hrCookie = cookieOf(res);
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  it('HR tạo NV không email → tài khoản username tự tạo, login bằng mã NV + Abcd123@', async () => {
    const created = await request(app.getHttpServer())
      .post(`${PREFIX}/employees`)
      .set('Cookie', hrCookie)
      .send({ code: empCode, fullName: 'Công Nhân', phone: empPhone, joinDate: '2026-01-01' })
      .expect(201);
    expect(created.body.userId).toBeTruthy();

    // Login bằng mã NV (username) + mật khẩu mặc định
    await request(app.getHttpServer())
      .post(`${PREFIX}/auth/login`)
      .send({ identifier: empCode, password: DEFAULT_EMPLOYEE_PASSWORD })
      .expect(200);
  });

  it('thiếu phone → 400 (validation)', async () => {
    await request(app.getHttpServer())
      .post(`${PREFIX}/employees`)
      .set('Cookie', hrCookie)
      .send({ code: `X${stamp}`, fullName: 'Thiếu phone', joinDate: '2026-01-01' })
      .expect(400);
  });

  it('quên mật khẩu qua mã NV + SĐT → đổi được, login mật khẩu mới', async () => {
    await request(app.getHttpServer())
      .post(`${PREFIX}/auth/reset-password-by-identity`)
      .send({ employeeCode: empCode, phone: empPhone, newPassword: 'NewPass456@' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`${PREFIX}/auth/login`)
      .send({ identifier: empCode, password: 'NewPass456@' })
      .expect(200);

    // Mật khẩu cũ không còn dùng được
    await request(app.getHttpServer())
      .post(`${PREFIX}/auth/login`)
      .send({ identifier: empCode, password: DEFAULT_EMPLOYEE_PASSWORD })
      .expect(401);
  });

  it('sai SĐT → 400 (không lộ phần nào sai)', async () => {
    await request(app.getHttpServer())
      .post(`${PREFIX}/auth/reset-password-by-identity`)
      .send({ employeeCode: empCode, phone: '0000000000', newPassword: 'NewPass789@' })
      .expect(400);
  });
});
