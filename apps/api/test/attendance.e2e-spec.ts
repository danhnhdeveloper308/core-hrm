/**
 * E2E Phase 4 — Attendance core + Timesheet engine:
 * - check-in/out web → TimesheetDay tính status đúng (LATE khi vào trễ quá grace).
 * - ngày lễ → HOLIDAY; có ca không log + cron → ABSENT.
 * - sửa công thủ công (correction) → tạo log MANUAL + recalc.
 *
 * Recalc gọi trực tiếp TimesheetService (đồng bộ) để test không phụ thuộc worker.
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ORG_ROLES } from '@repo/shared';
import argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TimesheetService } from '../src/modules/attendance/timesheet.service';
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
  return arr
    .map((c) => c.split(';')[0])
    .filter((p): p is string => !!p && p.includes('='))
    .join('; ');
}

describe('Attendance + Timesheet (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let timesheet: TimesheetService;

  const stamp = Date.now();
  const password = 'TestPass123';
  let orgId: string;
  let shiftId: string;
  let calendarId: string;
  let hrCookie: string;
  let empCookie: string;
  let employeeId: string;
  let hrEmployeeId: string;

  // Ngày test cố định trong quá khứ để isPast=true, tránh phụ thuộc "hôm nay"
  const day = '2026-03-16'; // Thứ 2
  const holiday = '2026-03-17';
  const absentDay = '2026-03-18';

  async function loginAs(email: string, roleId: string): Promise<{ cookie: string; userId: string }> {
    const user = await prisma.user.create({
      data: {
        email,
        name: email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        orgId,
        roles: { create: { roleId } },
      },
    });
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);
    return { cookie: cookieOf(res), userId: user.id };
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
    timesheet = app.get(TimesheetService);

    const org = await prisma.organization.create({
      data: { name: `Org Att ${stamp}`, slug: `e2e-att-${stamp}` },
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

    // Ca hành chính 08:00–17:00 + lịch lễ, gán mặc định org
    const shift = await prisma.workShift.create({
      data: {
        orgId,
        name: 'Hành chính',
        startTime: '08:00',
        endTime: '17:00',
        breakMinutes: 60,
        lateGraceMinutes: 5,
        workDays: [1, 2, 3, 4, 5],
      },
    });
    shiftId = shift.id;
    const cal = await prisma.holidayCalendar.create({ data: { orgId, name: 'Lễ VN' } });
    calendarId = cal.id;
    await prisma.holiday.create({
      data: {
        calendarId,
        startDate: new Date(holiday),
        endDate: new Date(holiday),
        name: 'Nghỉ test',
      },
    });
    await prisma.organization.update({
      where: { id: orgId },
      data: { defaultShiftId: shiftId, defaultCalendarId: calendarId },
    });

    const hrRole = await prisma.role.findFirstOrThrow({
      where: { orgId, name: ORG_ROLES.HR_MANAGER },
    });
    const hr = await loginAs(`e2e-hr-att-${stamp}@example.com`, hrRole.id);
    hrCookie = hr.cookie;
    const hrEmp = await prisma.employee.create({
      data: { orgId, userId: hr.userId, code: 'HR-1', fullName: 'HR Một', joinDate: new Date('2026-01-01') },
    });
    hrEmployeeId = hrEmp.id;

    const empRole = await prisma.role.findFirstOrThrow({
      where: { orgId, name: ORG_ROLES.EMPLOYEE },
    });
    const emp = await loginAs(`e2e-emp-att-${stamp}@example.com`, empRole.id);
    empCookie = emp.cookie;
    const employee = await prisma.employee.create({
      data: { orgId, userId: emp.userId, code: 'NV-1', fullName: 'Nhân Viên Một', joinDate: new Date('2026-01-01') },
    });
    employeeId = employee.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  it('check-in web → tạo log, tự suy IN', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/check`)
      .set('Cookie', empCookie)
      .send({})
      .expect(201);
    expect(res.body.type).toBe('IN');
    expect(res.body.source).toBe('WEB');
  });

  it('vào trễ quá grace → TimesheetDay status LATE', async () => {
    // Tạo log trực tiếp giờ local 08:30 và 17:00 (UTC = -7h)
    await prisma.attendanceLog.createMany({
      data: [
        { orgId, employeeId, recordedAt: new Date('2026-03-16T01:30:00Z'), type: 'IN', source: 'WEB' },
        { orgId, employeeId, recordedAt: new Date('2026-03-16T10:00:00Z'), type: 'OUT', source: 'WEB' },
      ],
    });
    await timesheet.recalc(orgId, employeeId, day);
    const ts = await prisma.timesheetDay.findUniqueOrThrow({
      where: { employeeId_date: { employeeId, date: new Date(day) } },
    });
    expect(ts.status).toBe('LATE');
    expect(ts.lateMinutes).toBe(25); // 08:30 - (08:00 + 5)
  });

  it('ngày lễ → status HOLIDAY', async () => {
    await timesheet.recalc(orgId, employeeId, holiday);
    const ts = await prisma.timesheetDay.findUniqueOrThrow({
      where: { employeeId_date: { employeeId, date: new Date(holiday) } },
    });
    expect(ts.status).toBe('HOLIDAY');
  });

  it('ngày làm việc quá khứ, không log → ABSENT', async () => {
    await timesheet.recalc(orgId, employeeId, absentDay);
    const ts = await prisma.timesheetDay.findUniqueOrThrow({
      where: { employeeId_date: { employeeId, date: new Date(absentDay) } },
    });
    expect(ts.status).toBe('ABSENT');
  });

  it('HR sửa công thủ công → tạo log MANUAL + recalc PRESENT', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/corrections`)
      .set('Cookie', hrCookie)
      .send({
        employeeId,
        date: absentDay,
        requestedIn: '08:00',
        requestedOut: '17:00',
        reason: 'Quên chấm công',
      })
      .expect(201);
    expect(res.body.status).toBe('PRESENT');

    const logs = await prisma.attendanceLog.findMany({
      where: {
        employeeId,
        source: 'MANUAL',
        recordedAt: {
          gte: new Date('2026-03-17T17:00:00Z'),
          lt: new Date('2026-03-18T17:00:00Z'),
        },
      },
    });
    expect(logs.length).toBe(2);
  });

  it('EMPLOYEE thường không có quyền xem chấm công người khác / sửa công → 403', async () => {
    await request(app.getHttpServer())
      .get(`${PREFIX}/attendance?employeeId=${hrEmployeeId}&from=${day}&to=${day}`)
      .set('Cookie', empCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/corrections`)
      .set('Cookie', empCookie)
      .send({ employeeId, date: day, requestedIn: '08:00', reason: 'x' })
      .expect(403);
  });

  it('HR xem grid công tháng chứa nhân viên', async () => {
    const res = await request(app.getHttpServer())
      .get(`${PREFIX}/attendance/grid?from=2026-03-01&to=2026-03-31`)
      .set('Cookie', hrCookie)
      .expect(200);
    const codes = (res.body as { employeeCode: string }[]).map((r) => r.employeeCode);
    expect(codes).toContain('NV-1');
  });

  it('HR sửa giờ công thủ công → khóa ngày; recalc tự động KHÔNG ghi đè', async () => {
    const editDay = '2026-03-20'; // Thứ 6
    const res = await request(app.getHttpServer())
      .patch(`${PREFIX}/attendance/timesheet`)
      .set('Cookie', hrCookie)
      .send({
        employeeId,
        date: editDay,
        firstIn: '08:00',
        lastOut: '17:00',
        note: 'Chốt công tay',
      })
      .expect(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.status).toBe('PRESENT');

    // Recalc sau đó không được ghi đè (vẫn PRESENT/locked dù không có log thật)
    await timesheet.recalc(orgId, employeeId, editDay);
    const after = await prisma.timesheetDay.findUniqueOrThrow({
      where: { employeeId_date: { employeeId, date: new Date(editDay) } },
    });
    expect(after.locked).toBe(true);
    expect(after.status).toBe('PRESENT');
  });

  it('HR reset (xóa) công ngày → xóa log + bảng công, gỡ khóa', async () => {
    // Ngày "vào trễ" (day) đang có log + timesheet LATE
    const before = await prisma.attendanceLog.count({
      where: {
        employeeId,
        recordedAt: {
          gte: new Date('2026-03-15T17:00:00Z'),
          lt: new Date('2026-03-16T17:00:00Z'),
        },
      },
    });
    expect(before).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/timesheet/reset`)
      .set('Cookie', hrCookie)
      .send({ employeeId, date: day })
      .expect(201);

    const logsAfter = await prisma.attendanceLog.count({
      where: {
        employeeId,
        recordedAt: {
          gte: new Date('2026-03-15T17:00:00Z'),
          lt: new Date('2026-03-16T17:00:00Z'),
        },
      },
    });
    expect(logsAfter).toBe(0);
    // ngày làm việc quá khứ, không còn log → ABSENT
    const ts = await prisma.timesheetDay.findUniqueOrThrow({
      where: { employeeId_date: { employeeId, date: new Date(day) } },
    });
    expect(ts.status).toBe('ABSENT');
    expect(ts.locked).toBe(false);
  });

  it('EMPLOYEE thường không được reset/sửa giờ công → 403', async () => {
    await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/timesheet/reset`)
      .set('Cookie', empCookie)
      .send({ employeeId, date: day })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${PREFIX}/attendance/timesheet`)
      .set('Cookie', empCookie)
      .send({ employeeId, date: day, firstIn: '08:00' })
      .expect(403);
  });
});
