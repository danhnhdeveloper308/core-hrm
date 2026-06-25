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
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { ApprovalService } from '../src/modules/approval/approval.service';
import { ApprovalSlaService } from '../src/modules/approval/approval-sla.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailQueueService } from '../src/queues/email.queue';

const emailedNotifications: string[] = [];
class StubEmailQueue {
  enqueueOtp() { return Promise.resolve(); }
  enqueueInvite() { return Promise.resolve(); }
  enqueueNewDeviceAlert() { return Promise.resolve(); }
  enqueueNotification(d: { to: string }) {
    emailedNotifications.push(d.to);
    return Promise.resolve();
  }
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

  it('Notification: NV nộp → quản lý nhận APPROVAL_PENDING; duyệt → NV nhận APPROVAL_DECIDED', async () => {
    type Unread = { count: number };
    type NotifItem = { type: string; title: string; link: string | null };
    type NotifList = { items: NotifItem[] };

    const mgrBefore = (
      await request(app.getHttpServer())
        .get(`${PREFIX}/notifications/unread-count`)
        .set('Cookie', managerCookie)
        .expect(200)
    ).body as Unread;

    // NV nộp đơn → quản lý (DIRECT_MANAGER) phải có thông báo cần duyệt
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/corrections/request`)
      .set('Cookie', workerCookie)
      .send({ date: '2026-03-14', requestedIn: '08:00', reason: 'Test notify' })
      .expect(201);
    const corrId = res.body.id as string;

    const mgrAfter = (
      await request(app.getHttpServer())
        .get(`${PREFIX}/notifications/unread-count`)
        .set('Cookie', managerCookie)
        .expect(200)
    ).body as Unread;
    expect(mgrAfter.count).toBeGreaterThan(mgrBefore.count);

    const mgrList = (
      await request(app.getHttpServer())
        .get(`${PREFIX}/notifications?limit=20`)
        .set('Cookie', managerCookie)
        .expect(200)
    ).body as NotifList;
    expect(
      mgrList.items.some(
        (n) => n.type === 'APPROVAL_PENDING' && n.link === '/dashboard/approvals',
      ),
    ).toBe(true);
    // Kênh email: quản lý (có email) phải được enqueue email thông báo
    expect(emailedNotifications).toContain(`mgr-${stamp}@e2e.vn`);

    // Quản lý duyệt → NV (requester) nhận APPROVAL_DECIDED
    const inst = await prisma.approvalInstance.findFirstOrThrow({
      where: { orgId, targetId: corrId },
    });
    await request(app.getHttpServer())
      .post(`${PREFIX}/approvals/${inst.id}/decide`)
      .set('Cookie', managerCookie)
      .send({ decision: 'APPROVE' })
      .expect(201);

    const workerList = (
      await request(app.getHttpServer())
        .get(`${PREFIX}/notifications?limit=20`)
        .set('Cookie', workerCookie)
        .expect(200)
    ).body as NotifList;
    expect(workerList.items.some((n) => n.type === 'APPROVAL_DECIDED')).toBe(true);

    // Đọc tất cả → unread về 0
    await request(app.getHttpServer())
      .post(`${PREFIX}/notifications/read-all`)
      .set('Cookie', workerCookie)
      .expect(200);
    const workerUnread = (
      await request(app.getHttpServer())
        .get(`${PREFIX}/notifications/unread-count`)
        .set('Cookie', workerCookie)
        .expect(200)
    ).body as Unread;
    expect(workerUnread.count).toBe(0);

    // Đăng ký FCM token → lưu DeviceToken
    await request(app.getHttpServer())
      .post(`${PREFIX}/notifications/device-tokens`)
      .set('Cookie', workerCookie)
      .send({ token: `e2e-fcm-${stamp}`, platform: 'web' })
      .expect(200);
    const tokenRow = await prisma.deviceToken.findUnique({
      where: { token: `e2e-fcm-${stamp}` },
    });
    expect(tokenRow).not.toBeNull();
  });

  it('SLA: phiếu PENDING quá hạn → nhắc người duyệt 1 lần (không spam)', async () => {
    const mgrUser = await prisma.user.findFirstOrThrow({
      where: { email: `mgr-${stamp}@e2e.vn` },
    });
    // Instance giả: 1 bước slaHours=1, người duyệt = manager, tạo 3h trước → quá hạn
    const inst = await prisma.approvalInstance.create({
      data: {
        orgId,
        targetType: 'ATTENDANCE_CORRECTION',
        targetId: randomUUID(),
        requesterEmpId: workerEmpId,
        currentStep: 1,
        status: 'PENDING',
        stepsSnapshot: [
          {
            order: 1,
            approverType: 'DIRECT_MANAGER',
            label: 'Duyệt',
            approverIds: [mgrUser.id],
            approverNames: ['QL'],
            skipped: false,
            decidedByName: null,
            decision: null,
            note: null,
            decidedAt: null,
            slaHours: 1,
          },
        ],
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    });

    const sla = app.get(ApprovalSlaService);
    const before = await prisma.notification.count({
      where: { userId: mgrUser.id, type: 'APPROVAL_PENDING' },
    });
    await sla.checkOverdue();
    const after = await prisma.notification.count({
      where: { userId: mgrUser.id, type: 'APPROVAL_PENDING' },
    });
    expect(after).toBeGreaterThan(before);
    const updated = await prisma.approvalInstance.findUniqueOrThrow({
      where: { id: inst.id },
    });
    expect(updated.slaRemindedAt).not.toBeNull();

    // Chạy lần 2 → KHÔNG nhắc lại cho cùng bước
    await sla.checkOverdue();
    const after2 = await prisma.notification.count({
      where: { userId: mgrUser.id, type: 'APPROVAL_PENDING' },
    });
    expect(after2).toBe(after);
  });

  it('Preferences: tắt email cho APPROVAL_PENDING → quản lý có in-app nhưng KHÔNG email', async () => {
    // Tắt kênh email cho loại "đơn cần tôi duyệt" của quản lý
    await request(app.getHttpServer())
      .put(`${PREFIX}/notifications/preferences`)
      .set('Cookie', managerCookie)
      .send({
        APPROVAL_PENDING: { inApp: true, email: false, push: true },
        APPROVAL_DECIDED: { inApp: true, email: true, push: true },
        GENERAL: { inApp: true, email: true, push: true },
      })
      .expect(200);

    emailedNotifications.length = 0;
    const mgrUser = await prisma.user.findFirstOrThrow({
      where: { email: `mgr-${stamp}@e2e.vn` },
    });
    const before = await prisma.notification.count({ where: { userId: mgrUser.id } });

    await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/corrections/request`)
      .set('Cookie', workerCookie)
      .send({ date: '2026-03-22', requestedIn: '08:00', reason: 'Pref test' })
      .expect(201);

    const after = await prisma.notification.count({ where: { userId: mgrUser.id } });
    expect(after).toBeGreaterThan(before); // in-app vẫn tạo
    expect(emailedNotifications).not.toContain(`mgr-${stamp}@e2e.vn`); // email bị tắt
  });

  it('Huỷ đơn: người gửi huỷ → instance CANCELLED + hiện ở "Đã xử lý" của quản lý', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/corrections/request`)
      .set('Cookie', workerCookie)
      .send({ date: '2026-03-24', requestedIn: '08:00', reason: 'Sẽ huỷ' })
      .expect(201);
    const corrId = res.body.id as string;

    // Người gửi huỷ (mô phỏng huỷ đơn gốc) → cancelByTarget
    await app.get(ApprovalService).cancelByTarget(orgId, corrId);

    const inst = await prisma.approvalInstance.findFirstOrThrow({
      where: { orgId, targetId: corrId },
    });
    expect(inst.status).toBe('CANCELLED');

    // "Đã xử lý" của quản lý hiển thị đơn đã huỷ (dù chưa kịp duyệt)
    const history = (
      await request(app.getHttpServer())
        .get(`${PREFIX}/approvals/history`)
        .set('Cookie', managerCookie)
        .expect(200)
    ).body as { targetId: string; status: string }[];
    expect(
      history.some((i) => i.targetId === corrId && i.status === 'CANCELLED'),
    ).toBe(true);
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
