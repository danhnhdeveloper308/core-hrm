/**
 * E2E — Tăng ca / đổi giờ qua luồng duyệt: NV đăng ký → quản lý duyệt →
 * OVERTIME cộng otMinutes; SHIFT_SHIFT khoá ngày (tính lại theo giờ mới).
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

describe('Tăng ca / đổi giờ qua duyệt (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const password = 'TestPass123';
  let orgId: string;
  let workerCookie: string;
  let managerCookie: string;
  let workerEmpId: string;

  async function makeUser(email: string, roleName: string, opts: { managerId?: string | null; code: string }) {
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
    const res = await request(app.getHttpServer()).post(`${PREFIX}/auth/login`).send({ identifier: email, password }).expect(200);
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

    const org = await prisma.organization.create({ data: { name: `Org OT ${stamp}`, slug: `e2e-ot-${stamp}` } });
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

    const flow = await prisma.approvalFlow.create({ data: { orgId, targetType: 'OT', name: 'OT', priority: 0 } });
    await prisma.approvalFlowStep.create({ data: { flowId: flow.id, order: 1, approverType: 'DIRECT_MANAGER' } });
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  it('Tăng ca 17:30–19:30 → duyệt → bảng công ngày đó có otMinutes = 120', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/ot/request`)
      .set('Cookie', workerCookie)
      .send({ type: 'OVERTIME', date: '2026-03-10', startTime: '17:30', endTime: '19:30', reason: 'Gấp đơn' })
      .expect(201);
    const inst = await prisma.approvalInstance.findFirstOrThrow({ where: { orgId, targetId: res.body.id } });
    await request(app.getHttpServer())
      .post(`${PREFIX}/approvals/${inst.id}/decide`)
      .set('Cookie', managerCookie)
      .send({ decision: 'APPROVE' })
      .expect(201);

    const ot = await prisma.otRequest.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(ot.status).toBe('APPROVED');
    const day = await prisma.timesheetDay.findUnique({
      where: { employeeId_date: { employeeId: workerEmpId, date: new Date('2026-03-10') } },
    });
    expect(day?.otMinutes).toBe(120);
    expect(day?.locked).toBe(true);
  });

  it('Đổi giờ (SHIFT_SHIFT) → duyệt → APPROVED + ngày bị khoá', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/ot/request`)
      .set('Cookie', workerCookie)
      .send({ type: 'SHIFT_SHIFT', date: '2026-03-11', startTime: '10:00', endTime: '19:00', reason: 'Đi trễ có phép' })
      .expect(201);
    const inst = await prisma.approvalInstance.findFirstOrThrow({ where: { orgId, targetId: res.body.id } });
    await request(app.getHttpServer())
      .post(`${PREFIX}/approvals/${inst.id}/decide`)
      .set('Cookie', managerCookie)
      .send({ decision: 'APPROVE' })
      .expect(201);

    const ot = await prisma.otRequest.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(ot.status).toBe('APPROVED');
    const day = await prisma.timesheetDay.findUnique({
      where: { employeeId_date: { employeeId: workerEmpId, date: new Date('2026-03-11') } },
    });
    expect(day?.locked).toBe(true);
  });
});
