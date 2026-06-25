/**
 * E2E — Phiếu tăng/giãn ca theo danh sách: upload Excel → tạo phiếu + luồng
 * duyệt → cấp duyệt → áp công cho toàn bộ NV (clamp theo khung đăng ký).
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ORG_ROLES } from '@repo/shared';
import argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailQueueService } from '../src/queues/email.queue';

class StubEmailQueue {
  enqueueOtp() { return Promise.resolve(); }
  enqueueInvite() { return Promise.resolve(); }
  enqueueNewDeviceAlert() { return Promise.resolve(); }
  enqueueNotification() { return Promise.resolve(); }
}

const PREFIX = '/api';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function cookieOf(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.map((c) => c.split(';')[0]).filter((p): p is string => !!p && p.includes('=')).join('; ');
}

async function buildSheet(rows: [string, string, string][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DangKy');
  ws.addRow(['STT', 'MSNV', 'HỌ & TÊN', 'NGÀY', 'LOẠI', 'LÝ DO']);
  rows.forEach(([code, date, variant], i) =>
    ws.addRow([i + 1, code, 'NV', date, variant, 'Đẩy SL']),
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Phiếu tăng/giãn ca theo danh sách (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const password = 'TestPass123';
  let orgId: string;
  let hrCookie: string;
  let approverCookie: string;
  let workerEmpId: string;
  const workerCode = `CN${stamp}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailQueueService).useValue(new StubEmailQueue()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
    prisma = app.get(PrismaService);

    const org = await prisma.organization.create({ data: { name: `Org SR ${stamp}`, slug: `e2e-sr-${stamp}` } });
    orgId = org.id;
    const perms = await prisma.permission.findMany();
    const permByName = new Map(perms.map((p) => [p.name, p.id]));
    const { DEFAULT_ORG_ROLE_PERMISSIONS, ORG_ROLE_DESCRIPTIONS, ALL_ORG_ROLES } = await import('@repo/shared');
    const roleByName = new Map<string, string>();
    for (const roleName of ALL_ORG_ROLES) {
      const role = await prisma.role.create({ data: { name: roleName, description: ORG_ROLE_DESCRIPTIONS[roleName], isSystem: true, orgId } });
      roleByName.set(roleName, role.id);
      await prisma.rolePermission.createMany({ data: DEFAULT_ORG_ROLE_PERMISSIONS[roleName].map((p) => ({ roleId: role.id, permissionId: permByName.get(p)! })) });
    }

    const mkUser = async (email: string, roleName: string, code: string) => {
      const user = await prisma.user.create({
        data: {
          email, name: code,
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
          status: 'ACTIVE', emailVerifiedAt: new Date(), orgId,
          roles: { create: { roleId: roleByName.get(roleName)! } },
        },
      });
      const emp = await prisma.employee.create({ data: { orgId, userId: user.id, code, fullName: code, joinDate: new Date('2024-01-01') } });
      const res = await request(app.getHttpServer()).post(`${PREFIX}/auth/login`).send({ identifier: email, password }).expect(200);
      return { cookie: cookieOf(res), userId: user.id, empId: emp.id };
    };

    const hr = await mkUser(`hr-${stamp}@e2e.vn`, ORG_ROLES.HR_MANAGER, `HR${stamp}`);
    hrCookie = hr.cookie;
    const approver = await mkUser(`gd-${stamp}@e2e.vn`, ORG_ROLES.ORG_ADMIN, `GD${stamp}`);
    approverCookie = approver.cookie;

    // Worker + ca có tăng ca đến 20:00, gán ca
    const worker = await prisma.employee.create({ data: { orgId, code: workerCode, fullName: 'Công nhân', joinDate: new Date('2024-01-01') } });
    workerEmpId = worker.id;
    const shift = await prisma.workShift.create({
      data: { orgId, name: 'Ca SX', startTime: '07:30', endTime: '16:30', tangCaEnd: '20:00', gianCaEnd: '18:00', otEnabled: true, workDays: [1, 2, 3, 4, 5, 6] },
    });
    await prisma.shiftAssignment.create({ data: { orgId, employeeId: worker.id, shiftId: shift.id, effectiveFrom: new Date('2024-01-01') } });

    // Flow SHIFT_BATCH: 1 cấp = người chỉ định (GĐ)
    const flow = await prisma.approvalFlow.create({ data: { orgId, targetType: 'SHIFT_BATCH', name: 'Duyệt phiếu', priority: 0 } });
    await prisma.approvalFlowStep.create({ data: { flowId: flow.id, order: 1, approverType: 'SPECIFIC_USER', userId: approver.userId, label: 'GĐNM' } });
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  it('upload danh sách → tạo phiếu PENDING + dòng; có dòng lỗi cho mã sai', async () => {
    const buf = await buildSheet([
      [workerCode, '2026-03-10', 'TANG_CA'],
      ['SAI_MA_XYZ', '2026-03-10', 'GIAN_CA'],
    ]);
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/shift-registrations/upload`)
      .set('Cookie', hrCookie)
      .field('title', 'Tuần 25 - NMTS1')
      .attach('file', buf, { filename: 'dk.xlsx', contentType: XLSX_MIME })
      .expect(201);
    expect(res.body.created).toBe(1);
    expect(res.body.errors.length).toBe(1);

    const inst = await prisma.approvalInstance.findFirstOrThrow({ where: { orgId, targetId: res.body.batchId } });
    expect(inst.summary).toContain('Tăng ca');

    // GĐ duyệt → áp công cho worker (clamp đến 20:00 → ngày bị khoá)
    await request(app.getHttpServer())
      .post(`${PREFIX}/approvals/${inst.id}/decide`)
      .set('Cookie', approverCookie)
      .send({ decision: 'APPROVE' })
      .expect(201);

    const batch = await prisma.shiftRegistrationBatch.findUniqueOrThrow({ where: { id: res.body.batchId } });
    expect(batch.status).toBe('APPROVED');
    const day = await prisma.timesheetDay.findUnique({
      where: { employeeId_date: { employeeId: workerEmpId, date: new Date('2026-03-10') } },
    });
    expect(day?.locked).toBe(true);
  });

  it('người duyệt thấy phiếu trong inbox với summary', async () => {
    const buf = await buildSheet([[workerCode, '2026-03-12', 'GIAN_CA']]);
    await request(app.getHttpServer())
      .post(`${PREFIX}/shift-registrations/upload`)
      .set('Cookie', hrCookie)
      .field('title', 'Tuần 25 - đợt 2')
      .attach('file', buf, { filename: 'dk2.xlsx', contentType: XLSX_MIME })
      .expect(201);

    const inbox = await request(app.getHttpServer())
      .get(`${PREFIX}/approvals/inbox`)
      .set('Cookie', approverCookie)
      .expect(200);
    const item = (inbox.body as { targetType: string; summary: string }[]).find(
      (i) => i.targetType === 'SHIFT_BATCH' && i.summary.includes('đợt 2'),
    );
    expect(item).toBeTruthy();
  });
});
