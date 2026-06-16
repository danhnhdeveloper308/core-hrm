/**
 * E2E Phase 7+8 — Leave + Approval engine N cấp theo cây.
 * Kịch bản chuỗi nhà máy: công nhân tạo đơn → Tổ trưởng (DIRECT_MANAGER) →
 * Giám đốc nhà máy (UNIT_MANAGER_OF_TYPE NHA_MAY) → Trưởng phòng HR (ROLE).
 * Acceptance: duyệt đủ 3 cấp → ledger trừ + timesheet ON_LEAVE; reject giữa
 * chừng → không trừ; sai lượt → 403.
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ORG_ROLES } from '@repo/shared';
import argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TimesheetService } from '../src/modules/attendance/timesheet.service';
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
  return arr
    .map((c) => c.split(';')[0])
    .filter((p): p is string => !!p && p.includes('='))
    .join('; ');
}

describe('Leave + Approval N cấp (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const password = 'TestPass123';
  let orgId: string;
  let leaveTypeId: string;
  let nhaMayUnitId: string;

  let workerCookie: string;
  let workerEmpId: string;
  let leaderCookie: string;
  let directorCookie: string;
  let hrCookie: string;

  async function makeUser(
    email: string,
    roleName: string,
    opts: { orgUnitId?: string | null; managerId?: string | null; code: string },
  ): Promise<{ cookie: string; userId: string; empId: string }> {
    const role = await prisma.role.findFirstOrThrow({ where: { orgId, name: roleName } });
    const user = await prisma.user.create({
      data: {
        email,
        name: opts.code,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        orgId,
        roles: { create: { roleId: role.id } },
      },
    });
    const emp = await prisma.employee.create({
      data: {
        orgId,
        userId: user.id,
        code: opts.code,
        fullName: opts.code,
        joinDate: new Date('2024-01-01'),
        orgUnitId: opts.orgUnitId ?? null,
        managerId: opts.managerId ?? null,
      },
    });
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);
    return { cookie: cookieOf(res), userId: user.id, empId: emp.id };
  }

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
      data: { name: `Org Leave ${stamp}`, slug: `e2e-leave-${stamp}` },
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

    // Cây: ROOT → NHA_MAY
    const rootType = await prisma.orgUnitType.create({
      data: { orgId, code: 'TAP_DOAN', name: 'Tập đoàn', rank: 1 },
    });
    const nmType = await prisma.orgUnitType.create({
      data: { orgId, code: 'NHA_MAY', name: 'Nhà máy', rank: 2 },
    });
    const root = await prisma.orgUnit.create({
      data: { orgId, typeId: rootType.id, name: 'TĐ', code: 'ROOT', path: '' },
    });
    await prisma.orgUnit.update({ where: { id: root.id }, data: { path: `/${root.id}/` } });
    const nhaMay = await prisma.orgUnit.create({
      data: { orgId, typeId: nmType.id, parentId: root.id, name: 'Nhà máy TS1', code: 'NM1', path: '' },
    });
    await prisma.orgUnit.update({
      where: { id: nhaMay.id },
      data: { path: `/${root.id}/${nhaMay.id}/` },
    });
    nhaMayUnitId = nhaMay.id;

    // Người dùng theo cây
    const director = await makeUser(`dir-${stamp}@e2e.vn`, ORG_ROLES.UNIT_MANAGER, {
      orgUnitId: nhaMay.id,
      code: 'GĐ Nhà máy',
    });
    directorCookie = director.cookie;
    // GĐ là manager của nhà máy
    await prisma.orgUnit.update({
      where: { id: nhaMay.id },
      data: { managerId: director.empId },
    });
    const leader = await makeUser(`leader-${stamp}@e2e.vn`, ORG_ROLES.UNIT_MANAGER, {
      orgUnitId: nhaMay.id,
      managerId: director.empId,
      code: 'Tổ trưởng',
    });
    leaderCookie = leader.cookie;
    const worker = await makeUser(`worker-${stamp}@e2e.vn`, ORG_ROLES.EMPLOYEE, {
      orgUnitId: nhaMay.id,
      managerId: leader.empId,
      code: 'Công nhân',
    });
    workerCookie = worker.cookie;
    workerEmpId = worker.empId;
    const hr = await makeUser(`hr-${stamp}@e2e.vn`, ORG_ROLES.HR_MANAGER, {
      code: 'Trưởng phòng HR',
    });
    hrCookie = hr.cookie;

    // Loại phép + chính sách (12 ngày) + cấp sẵn số dư cho worker
    const lt = await prisma.leaveType.create({
      data: { orgId, name: 'Phép năm', code: 'ANNUAL', paid: true },
    });
    leaveTypeId = lt.id;
    await prisma.leavePolicy.create({
      data: { orgId, leaveTypeId: lt.id, daysPerYear: 12, accrualType: 'YEARLY_UPFRONT' },
    });
    const year = new Date().getUTCFullYear();
    await prisma.leaveBalanceEntry.create({
      data: {
        orgId, employeeId: worker.empId, leaveTypeId: lt.id, year,
        amount: 12, type: 'ACCRUAL', period: `${year}`, reason: 'Cấp năm',
      },
    });

    // Flow 3 cấp: DIRECT_MANAGER → UNIT_MANAGER_OF_TYPE(NHA_MAY) → ROLE(HR_MANAGER)
    const hrRole = await prisma.role.findFirstOrThrow({
      where: { orgId, name: ORG_ROLES.HR_MANAGER },
    });
    const flow = await prisma.approvalFlow.create({
      data: { orgId, targetType: 'LEAVE', name: 'Nghỉ phép NM', priority: 0 },
    });
    await prisma.approvalFlowStep.createMany({
      data: [
        { flowId: flow.id, order: 1, approverType: 'DIRECT_MANAGER' },
        { flowId: flow.id, order: 2, approverType: 'UNIT_MANAGER_OF_TYPE', unitTypeCode: 'NHA_MAY' },
        { flowId: flow.id, order: 3, approverType: 'ROLE', roleId: hrRole.id },
      ],
    });
    void nhaMayUnitId;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  let requestId: string;

  it('công nhân tạo đơn nghỉ → balance pending, status PENDING', async () => {
    // chọn 2 ngày làm việc (T2-T3 tương lai gần)
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/leave/requests`)
      .set('Cookie', workerCookie)
      .send({
        leaveTypeId,
        startDate: '2026-07-13', // T2
        endDate: '2026-07-14', // T3
        reason: 'Việc gia đình',
      })
      .expect(201);
    requestId = res.body.id;
    expect(res.body.status).toBe('PENDING');
    expect(res.body.totalDays).toBe(2);

    const bal = await request(app.getHttpServer())
      .get(`${PREFIX}/leave/balance/me`)
      .set('Cookie', workerCookie)
      .expect(200);
    const annual = bal.body.find((b: { leaveTypeId: string }) => b.leaveTypeId === leaveTypeId);
    expect(annual.pending).toBe(2);
    expect(annual.available).toBe(10); // 12 - 2 pending
  });

  it('sai lượt: GĐ duyệt khi đang ở bước Tổ trưởng → 403', async () => {
    const inst = await prisma.approvalInstance.findFirstOrThrow({
      where: { orgId, targetId: requestId },
    });
    await request(app.getHttpServer())
      .post(`${PREFIX}/approvals/${inst.id}/decide`)
      .set('Cookie', directorCookie)
      .send({ decision: 'APPROVE' })
      .expect(403);
  });

  it('duyệt tuần tự 3 cấp → APPROVED + ledger trừ + timesheet ON_LEAVE', async () => {
    const inst = await prisma.approvalInstance.findFirstOrThrow({
      where: { orgId, targetId: requestId },
    });
    // Bước 1: Tổ trưởng
    await request(app.getHttpServer())
      .post(`${PREFIX}/approvals/${inst.id}/decide`)
      .set('Cookie', leaderCookie)
      .send({ decision: 'APPROVE' })
      .expect(201);
    // Bước 2: GĐ nhà máy
    await request(app.getHttpServer())
      .post(`${PREFIX}/approvals/${inst.id}/decide`)
      .set('Cookie', directorCookie)
      .send({ decision: 'APPROVE' })
      .expect(201);
    // Bước 3: HR → hoàn tất
    const final = await request(app.getHttpServer())
      .post(`${PREFIX}/approvals/${inst.id}/decide`)
      .set('Cookie', hrCookie)
      .send({ decision: 'APPROVE' })
      .expect(201);
    expect(final.body.status).toBe('APPROVED');

    const req2 = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(req2.status).toBe('APPROVED');

    // Ledger có USAGE -2
    const usage = await prisma.leaveBalanceEntry.findFirst({
      where: { requestId, type: 'USAGE' },
    });
    expect(usage).not.toBeNull();
    expect(Number(usage!.amount)).toBe(-2);

    // Timesheet ngày nghỉ = ON_LEAVE (recalc đồng bộ qua queue — gọi trực tiếp service để chắc)
    const ts = app.get(TimesheetService);
    await ts.recalc(orgId, workerEmpId, '2026-07-13');
    const day = await prisma.timesheetDay.findUnique({
      where: { employeeId_date: { employeeId: workerEmpId, date: new Date('2026-07-13') } },
    });
    expect(day?.status).toBe('ON_LEAVE');
  });

  it('inbox của Tổ trưởng rỗng sau khi đã duyệt xong', async () => {
    const res = await request(app.getHttpServer())
      .get(`${PREFIX}/approvals/inbox`)
      .set('Cookie', leaderCookie)
      .expect(200);
    expect(res.body.find((i: { targetId: string }) => i.targetId === requestId)).toBeUndefined();
  });

  it('reject giữa chừng → REJECTED, không trừ phép', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/leave/requests`)
      .set('Cookie', workerCookie)
      .send({ leaveTypeId, startDate: '2026-07-20', endDate: '2026-07-20', reason: 'Test reject' })
      .expect(201);
    const rid = res.body.id;
    const inst = await prisma.approvalInstance.findFirstOrThrow({
      where: { orgId, targetId: rid },
    });
    await request(app.getHttpServer())
      .post(`${PREFIX}/approvals/${inst.id}/decide`)
      .set('Cookie', leaderCookie)
      .send({ decision: 'REJECT', note: 'Không duyệt' })
      .expect(201);

    const req = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: rid } });
    expect(req.status).toBe('REJECTED');
    const usage = await prisma.leaveBalanceEntry.findFirst({
      where: { requestId: rid, type: 'USAGE' },
    });
    expect(usage).toBeNull();
  });

  it('HR duyệt thay bất kỳ bước (override)', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/leave/requests`)
      .set('Cookie', workerCookie)
      .send({ leaveTypeId, startDate: '2026-07-27', endDate: '2026-07-27', reason: 'Override' })
      .expect(201);
    const inst = await prisma.approvalInstance.findFirstOrThrow({
      where: { orgId, targetId: res.body.id },
    });
    // Đang ở bước 1 (Tổ trưởng) nhưng HR có leave:approve → duyệt thay được
    await request(app.getHttpServer())
      .post(`${PREFIX}/approvals/${inst.id}/decide`)
      .set('Cookie', hrCookie)
      .send({ decision: 'APPROVE' })
      .expect(201);
  });
});
