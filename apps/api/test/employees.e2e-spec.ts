/**
 * E2E Phase 2 — Employee management:
 * - HR tạo/sửa/xoá hồ sơ + mời tài khoản; cursor pagination + filter.
 * - EMPLOYEE thường: bị 403 khi list, chỉ thấy hồ sơ mình qua /employees/me.
 * - TERMINATED → tài khoản liên kết bị khoá + revoke session.
 *
 * Yêu cầu: Postgres + Redis local (pnpm db:up) + đã seed (pnpm db:seed).
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ORG_ROLES } from '@repo/shared';
import argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailQueueService } from '../src/queues/email.queue';

class StubEmailQueue {
  enqueueOtp(): Promise<void> {
    return Promise.resolve();
  }
  enqueueInvite(): Promise<void> {
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
    if (pair && eq > 0) result[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return result;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

describe('Employee management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const password = 'TestPass123';
  let orgId: string;
  let hrCookie: string;
  let employeeCookie: string;
  let employeeUserId: string;
  let createdEmployeeId: string;

  async function createUserAndLogin(
    email: string,
    roleId: string,
    userOrgId: string | null,
  ): Promise<{ cookie: string; userId: string }> {
    const user = await prisma.user.create({
      data: {
        email,
        name: email.split('@')[0] ?? email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        orgId: userOrgId,
        roles: { create: { roleId } },
      },
    });
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/auth/login`)
      .send({ identifier: email, password })
      .expect(200);
    return { cookie: cookieHeader(extractCookies(res)), userId: user.id };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailQueueService)
      .useValue(new StubEmailQueue())
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
    prisma = app.get(PrismaService);

    // Tạo org test trực tiếp + roles (không qua API cho gọn)
    const org = await prisma.organization.create({
      data: { name: `Org E2E Emp ${stamp}`, slug: `e2e-emp-${stamp}` },
    });
    orgId = org.id;
    const perms = await prisma.permission.findMany();
    const permByName = new Map(perms.map((p) => [p.name, p.id]));
    const { DEFAULT_ORG_ROLE_PERMISSIONS, ORG_ROLE_DESCRIPTIONS, ALL_ORG_ROLES } =
      await import('@repo/shared');
    for (const roleName of ALL_ORG_ROLES) {
      const role = await prisma.role.create({
        data: {
          name: roleName,
          description: ORG_ROLE_DESCRIPTIONS[roleName],
          isSystem: true,
          orgId,
        },
      });
      await prisma.rolePermission.createMany({
        data: DEFAULT_ORG_ROLE_PERMISSIONS[roleName].map((p) => ({
          roleId: role.id,
          permissionId: permByName.get(p)!,
        })),
      });
    }

    const hrRole = await prisma.role.findFirstOrThrow({
      where: { orgId, name: ORG_ROLES.HR_MANAGER },
    });
    ({ cookie: hrCookie } = await createUserAndLogin(
      `e2e-hr-${stamp}@example.com`,
      hrRole.id,
      orgId,
    ));

    const employeeRole = await prisma.role.findFirstOrThrow({
      where: { orgId, name: ORG_ROLES.EMPLOYEE },
    });
    ({ cookie: employeeCookie, userId: employeeUserId } =
      await createUserAndLogin(
        `e2e-emp-${stamp}@example.com`,
        employeeRole.id,
        orgId,
      ));
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  it('HR tạo hồ sơ + mời tài khoản; mã trùng → 409', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/employees`)
      .set('Cookie', hrCookie)
      .send({
        code: 'NV-001',
        fullName: 'Nhân Viên Một',
        phone: '0900000001',
        joinDate: '2026-01-15',
        inviteEmail: `e2e-invited-${stamp}@example.com`,
      })
      .expect(201);
    createdEmployeeId = res.body.id;
    expect(res.body.userId).toBeTruthy();
    expect(res.body.userEmail).toBe(`e2e-invited-${stamp}@example.com`);

    await request(app.getHttpServer())
      .post(`${PREFIX}/employees`)
      .set('Cookie', hrCookie)
      .send({ code: 'NV-001', fullName: 'Trùng Mã', phone: '0900000002', joinDate: '2026-01-15' })
      .expect(409);
  });

  it('HR list + filter + cursor pagination', async () => {
    // Thêm vài hồ sơ
    for (let i = 2; i <= 4; i++) {
      await request(app.getHttpServer())
        .post(`${PREFIX}/employees`)
        .set('Cookie', hrCookie)
        .send({
          code: `NV-00${i}`,
          fullName: `Nhân Viên ${i}`,
          phone: `09000000${i}`,
          joinDate: '2026-02-01',
          status: i === 4 ? 'PROBATION' : 'ACTIVE',
        })
        .expect(201);
    }

    const page1 = await request(app.getHttpServer())
      .get(`${PREFIX}/employees?limit=2`)
      .set('Cookie', hrCookie)
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app.getHttpServer())
      .get(`${PREFIX}/employees?limit=2&cursor=${page1.body.nextCursor}`)
      .set('Cookie', hrCookie)
      .expect(200);
    const ids1 = page1.body.items.map((e: { id: string }) => e.id);
    const ids2 = page2.body.items.map((e: { id: string }) => e.id);
    expect(ids1.some((id: string) => ids2.includes(id))).toBe(false);

    const probation = await request(app.getHttpServer())
      .get(`${PREFIX}/employees?status=PROBATION`)
      .set('Cookie', hrCookie)
      .expect(200);
    expect(
      probation.body.items.every(
        (e: { status: string }) => e.status === 'PROBATION',
      ),
    ).toBe(true);

    const search = await request(app.getHttpServer())
      .get(`${PREFIX}/employees?search=NV-003`)
      .set('Cookie', hrCookie)
      .expect(200);
    expect(search.body.items).toHaveLength(1);
  });

  it('EMPLOYEE thường: 403 khi list; thấy hồ sơ mình qua /employees/me', async () => {
    await request(app.getHttpServer())
      .get(`${PREFIX}/employees`)
      .set('Cookie', employeeCookie)
      .expect(403);

    // Chưa có hồ sơ → null
    const empty = await request(app.getHttpServer())
      .get(`${PREFIX}/employees/me`)
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(empty.body).toEqual({});

    // HR tạo hồ sơ link với user này
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/employees`)
      .set('Cookie', hrCookie)
      .send({ code: 'NV-SELF', fullName: 'Chính Mình', phone: '0900000099', joinDate: '2026-03-01' })
      .expect(201);
    await prisma.employee.update({
      where: { id: res.body.id },
      data: { userId: employeeUserId },
    });

    const me = await request(app.getHttpServer())
      .get(`${PREFIX}/employees/me`)
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(me.body.code).toBe('NV-SELF');
  });

  it('cập nhật TERMINATED → user liên kết bị khoá + revoke session', async () => {
    // User được mời ở test 1 chưa kích hoạt — gán mật khẩu để login thử
    const invitedUser = await prisma.user.findUniqueOrThrow({
      where: { email: `e2e-invited-${stamp}@example.com` },
    });
    await prisma.user.update({
      where: { id: invitedUser.id },
      data: {
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        emailVerifiedAt: new Date(),
      },
    });
    // Login được trước khi terminate
    await request(app.getHttpServer())
      .post(`${PREFIX}/auth/login`)
      .send({ identifier: invitedUser.email, password })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`${PREFIX}/employees/${createdEmployeeId}`)
      .set('Cookie', hrCookie)
      .send({ status: 'TERMINATED', leaveDate: '2026-06-01' })
      .expect(200);

    const lockedUser = await prisma.user.findUniqueOrThrow({
      where: { id: invitedUser.id },
    });
    expect(lockedUser.status).toBe('INACTIVE');

    // Login lại → bị chặn vì INACTIVE
    await request(app.getHttpServer())
      .post(`${PREFIX}/auth/login`)
      .send({ identifier: invitedUser.email, password })
      .expect(403);
  });

  it('EMPLOYEE không có quyền tạo/sửa/xoá hồ sơ → 403', async () => {
    await request(app.getHttpServer())
      .post(`${PREFIX}/employees`)
      .set('Cookie', employeeCookie)
      .send({ code: 'NV-HACK', fullName: 'Hack', joinDate: '2026-01-01' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${PREFIX}/employees/${createdEmployeeId}`)
      .set('Cookie', employeeCookie)
      .send({ fullName: 'Hack' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`${PREFIX}/employees/${createdEmployeeId}`)
      .set('Cookie', employeeCookie)
      .expect(403);
  });

  it('HR xoá hồ sơ', async () => {
    await request(app.getHttpServer())
      .delete(`${PREFIX}/employees/${createdEmployeeId}`)
      .set('Cookie', hrCookie)
      .expect(200);
    const gone = await prisma.employee.findUnique({
      where: { id: createdEmployeeId },
    });
    expect(gone).toBeNull();
  });
});
