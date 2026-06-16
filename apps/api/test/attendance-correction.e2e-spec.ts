/**
 * E2E — Điều chỉnh công qua luồng duyệt: NV xin sửa → quản lý duyệt → áp log
 * MANUAL vào bảng công. Reject → không áp.
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

describe('Điều chỉnh công qua duyệt (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const password = 'TestPass123';
  let orgId: string;
  let workerCookie: string;
  let managerCookie: string;
  let workerEmpId: string;

  async function makeUser(
    email: string,
    roleName: string,
    opts: { managerId?: string | null; code: string },
  ): Promise<{ cookie: string; empId: string }> {
    const role = await prisma.role.findFirstOrThrow({ where: { orgId, name: roleName } });
    const user = await prisma.user.create({
      data: {
        email, name: opts.code,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: 'ACTIVE', emailVerifiedAt: new Date(), orgId,
        roles: { create: { roleId: role.id } },
      },
    });
    const emp = await prisma.employee.create({
      data: { orgId, userId: user.id, code: opts.code, fullName: opts.code, joinDate: new Date('2024-01-01'), managerId: opts.managerId ?? null },
    });
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/auth/login`).send({ identifier: email, password }).expect(200);
    return { cookie: cookieOf(res), empId: emp.id };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailQueueService).useValue(new StubEmailQueue()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
    prisma = app.get(PrismaService);

    const org = await prisma.organization.create({ data: { name: `Org Corr ${stamp}`, slug: `e2e-corr-${stamp}` } });
    orgId = org.id;
    const perms = await prisma.permission.findMany();
    const permByName = new Map(perms.map((p) => [p.name, p.id]));
    const { DEFAULT_ORG_ROLE_PERMISSIONS, ORG_ROLE_DESCRIPTIONS, ALL_ORG_ROLES } = await import('@repo/shared');
    for (const roleName of ALL_ORG_ROLES) {
      const role = await prisma.role.create({ data: { name: roleName, description: ORG_ROLE_DESCRIPTIONS[roleName], isSystem: true, orgId } });
      await prisma.rolePermission.createMany({ data: DEFAULT_ORG_ROLE_PERMISSIONS[roleName].map((p) => ({ roleId: role.id, permissionId: permByName.get(p)! })) });
    }
    const manager = await makeUser(`mgr-${stamp}@e2e.vn`, ORG_ROLES.UNIT_MANAGER, { code: 'QL' });
    managerCookie = manager.cookie;
    const worker = await makeUser(`w-${stamp}@e2e.vn`, ORG_ROLES.EMPLOYEE, { managerId: manager.empId, code: 'CN' });
    workerCookie = worker.cookie;
    workerEmpId = worker.empId;

    const flow = await prisma.approvalFlow.create({ data: { orgId, targetType: 'ATTENDANCE_CORRECTION', name: 'Sửa công', priority: 0 } });
    await prisma.approvalFlowStep.create({ data: { flowId: flow.id, order: 1, approverType: 'DIRECT_MANAGER' } });
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  it('NV xin sửa công → PENDING; quản lý duyệt → APPROVED + có log MANUAL', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/corrections/request`)
      .set('Cookie', workerCookie)
      .send({ date: '2026-03-10', requestedIn: '08:00', requestedOut: '17:00', reason: 'Quên chấm' })
      .expect(201);
    const corrId = res.body.id as string;

    const inst = await prisma.approvalInstance.findFirstOrThrow({ where: { orgId, targetId: corrId } });
    await request(app.getHttpServer())
      .post(`${PREFIX}/approvals/${inst.id}/decide`)
      .set('Cookie', managerCookie)
      .send({ decision: 'APPROVE' })
      .expect(201);

    const corr = await prisma.attendanceCorrection.findUniqueOrThrow({ where: { id: corrId } });
    expect(corr.status).toBe('APPROVED');
    const logs = await prisma.attendanceLog.findMany({ where: { employeeId: workerEmpId, source: 'MANUAL' } });
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  it('NV xin sửa công → quản lý từ chối → REJECTED, không thêm log', async () => {
    const before = await prisma.attendanceLog.count({ where: { employeeId: workerEmpId } });
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/corrections/request`)
      .set('Cookie', workerCookie)
      .send({ date: '2026-03-12', requestedIn: '08:00', reason: 'Test reject' })
      .expect(201);
    const inst = await prisma.approvalInstance.findFirstOrThrow({ where: { orgId, targetId: res.body.id } });
    await request(app.getHttpServer())
      .post(`${PREFIX}/approvals/${inst.id}/decide`)
      .set('Cookie', managerCookie)
      .send({ decision: 'REJECT', note: 'Không hợp lệ' })
      .expect(201);

    const corr = await prisma.attendanceCorrection.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(corr.status).toBe('REJECTED');
    const after = await prisma.attendanceLog.count({ where: { employeeId: workerEmpId } });
    expect(after).toBe(before);
  });
});
