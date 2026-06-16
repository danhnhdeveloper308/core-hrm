/**
 * E2E Phase 1 — Multi-tenancy + cơ cấu tổ chức:
 * - Platform admin tạo org preset tập đoàn → provision types/root/roles + mời admin.
 * - Org admin dựng cây ≥ 4 tầng, move node → path cả subtree cập nhật đúng.
 * - Cách ly tenant: user org A không đọc/sửa được resource org B (404),
 *   list users/roles chỉ thấy của org mình.
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

describe('Multi-tenancy + org structure (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const platformEmail = `e2e-platform-${stamp}@example.com`;
  const password = 'TestPass123';

  let platformCookie: string;
  let orgACookie: string;
  let orgBCookie: string;
  let orgAId: string;
  let orgBId: string;

  /** Tạo user active + gán role, trả cookie đã login. */
  async function createUserAndLogin(
    email: string,
    roleId: string,
    orgId: string | null,
  ): Promise<string> {
    await prisma.user.create({
      data: {
        email,
        name: email.split('@')[0] ?? email,
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
    return cookieHeader(extractCookies(res));
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

    const superAdminRole = await prisma.role.findFirstOrThrow({
      where: { name: 'SUPER_ADMIN', orgId: null },
    });
    platformCookie = await createUserAndLogin(
      platformEmail,
      superAdminRole.id,
      null,
    );
  });

  afterAll(async () => {
    // Dọn org test (cascade users/units/roles) + platform admin test
    await prisma.organization.deleteMany({
      where: { slug: { in: [`e2e-corp-${stamp}`, `e2e-single-${stamp}`] } },
    });
    await prisma.user.deleteMany({ where: { email: platformEmail } });
    await app.close();
  });

  it('platform admin tạo org preset tập đoàn → provision đủ types + root + roles', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/organizations`)
      .set('Cookie', platformCookie)
      .send({
        name: `Tập đoàn E2E ${stamp}`,
        slug: `e2e-corp-${stamp}`,
        preset: 'CORPORATION',
        adminEmail: `e2e-orga-admin-${stamp}@example.com`,
        adminName: 'Org A Admin',
      })
      .expect(201);
    orgAId = res.body.id;

    const types = await prisma.orgUnitType.findMany({ where: { orgId: orgAId } });
    expect(types).toHaveLength(7); // preset tập đoàn sản xuất

    const roles = await prisma.role.findMany({ where: { orgId: orgAId } });
    expect(roles.map((r) => r.name).sort()).toEqual(
      [...Object.values(ORG_ROLES)].sort(),
    );

    const root = await prisma.orgUnit.findFirstOrThrow({
      where: { orgId: orgAId },
    });
    expect(root.path).toBe(`/${root.id}/`);

    // User được mời có orgId đúng
    const invited = await prisma.user.findUnique({
      where: { email: `e2e-orga-admin-${stamp}@example.com` },
    });
    expect(invited?.orgId).toBe(orgAId);
  });

  it('tạo org B (preset công ty đơn) để test cách ly', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/organizations`)
      .set('Cookie', platformCookie)
      .send({
        name: `Công ty E2E ${stamp}`,
        slug: `e2e-single-${stamp}`,
        preset: 'SINGLE_COMPANY',
        adminEmail: `e2e-orgb-admin-${stamp}@example.com`,
        adminName: 'Org B Admin',
      })
      .expect(201);
    orgBId = res.body.id;

    const types = await prisma.orgUnitType.findMany({ where: { orgId: orgBId } });
    expect(types).toHaveLength(3);
  });

  it('org admin login và dựng cây ≥ 4 tầng; org B admin login', async () => {
    const orgAAdminRole = await prisma.role.findFirstOrThrow({
      where: { orgId: orgAId, name: ORG_ROLES.ORG_ADMIN },
    });
    orgACookie = await createUserAndLogin(
      `e2e-orga-user-${stamp}@example.com`,
      orgAAdminRole.id,
      orgAId,
    );
    const orgBAdminRole = await prisma.role.findFirstOrThrow({
      where: { orgId: orgBId, name: ORG_ROLES.ORG_ADMIN },
    });
    orgBCookie = await createUserAndLogin(
      `e2e-orgb-user-${stamp}@example.com`,
      orgBAdminRole.id,
      orgBId,
    );

    // Dựng cây: ROOT → KHOI_NGANH → CONG_TY_TV → NHA_MAY (4 tầng)
    const typesRes = await request(app.getHttpServer())
      .get(`${PREFIX}/org-unit-types`)
      .set('Cookie', orgACookie)
      .expect(200);
    const typeByCode = new Map<string, string>(
      (typesRes.body as { code: string; id: string }[]).map((t) => [t.code, t.id]),
    );

    const unitsRes = await request(app.getHttpServer())
      .get(`${PREFIX}/org-units`)
      .set('Cookie', orgACookie)
      .expect(200);
    const root = (unitsRes.body as { id: string; code: string }[]).find(
      (u) => u.code === 'ROOT',
    );
    expect(root).toBeDefined();

    let parentId = root!.id;
    const levels: [string, string][] = [
      ['KHOI_NGANH', 'KN-01'],
      ['CONG_TY_TV', 'CTTV-01'],
      ['NHA_MAY', 'NM-01'],
    ];
    for (const [typeCode, code] of levels) {
      const res = await request(app.getHttpServer())
        .post(`${PREFIX}/org-units`)
        .set('Cookie', orgACookie)
        .send({
          name: `Đơn vị ${code}`,
          code,
          typeId: typeByCode.get(typeCode),
          parentId,
        })
        .expect(201);
      parentId = res.body.id;
    }

    const leaf = await prisma.orgUnit.findFirstOrThrow({
      where: { orgId: orgAId, code: 'NM-01' },
    });
    // path "/root/kn/cttv/nm/" = 4 tầng
    expect(leaf.path.split('/').filter(Boolean)).toHaveLength(4);
  });

  it('move node → path cả subtree cập nhật đúng; cấm move vào subtree của mình', async () => {
    const kn = await prisma.orgUnit.findFirstOrThrow({
      where: { orgId: orgAId, code: 'KN-01' },
    });
    const root = await prisma.orgUnit.findFirstOrThrow({
      where: { orgId: orgAId, code: 'ROOT' },
    });

    // Tạo nhánh mới KN-02 dưới root rồi move CTTV-01 (kèm con NM-01) sang đó
    const typesRes = await request(app.getHttpServer())
      .get(`${PREFIX}/org-unit-types`)
      .set('Cookie', orgACookie);
    const knType = (typesRes.body as { code: string; id: string }[]).find(
      (t) => t.code === 'KHOI_NGANH',
    );
    const kn2Res = await request(app.getHttpServer())
      .post(`${PREFIX}/org-units`)
      .set('Cookie', orgACookie)
      .send({ name: 'Khối 2', code: 'KN-02', typeId: knType!.id, parentId: root.id })
      .expect(201);

    const cttv = await prisma.orgUnit.findFirstOrThrow({
      where: { orgId: orgAId, code: 'CTTV-01' },
    });

    await request(app.getHttpServer())
      .patch(`${PREFIX}/org-units/${cttv.id}/move`)
      .set('Cookie', orgACookie)
      .send({ parentId: kn2Res.body.id })
      .expect(200);

    const movedCttv = await prisma.orgUnit.findUniqueOrThrow({
      where: { id: cttv.id },
    });
    const movedLeaf = await prisma.orgUnit.findFirstOrThrow({
      where: { orgId: orgAId, code: 'NM-01' },
    });
    expect(movedCttv.path).toBe(`${kn2Res.body.path}${cttv.id}/`);
    // Con cháu đi theo path mới
    expect(movedLeaf.path.startsWith(movedCttv.path)).toBe(true);
    expect(movedLeaf.path).toBe(`${movedCttv.path}${movedLeaf.id}/`);

    // Cấm move root vào cháu của nó
    await request(app.getHttpServer())
      .patch(`${PREFIX}/org-units/${root.id}/move`)
      .set('Cookie', orgACookie)
      .send({ parentId: kn.id })
      .expect(400);
  });

  it('cách ly tenant: org B không đọc/sửa được unit của org A → 404', async () => {
    const unitA = await prisma.orgUnit.findFirstOrThrow({
      where: { orgId: orgAId, code: 'NM-01' },
    });

    await request(app.getHttpServer())
      .patch(`${PREFIX}/org-units/${unitA.id}`)
      .set('Cookie', orgBCookie)
      .send({ name: 'Hack' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`${PREFIX}/org-units/${unitA.id}`)
      .set('Cookie', orgBCookie)
      .expect(404);

    // List units của B không chứa unit của A
    const res = await request(app.getHttpServer())
      .get(`${PREFIX}/org-units`)
      .set('Cookie', orgBCookie)
      .expect(200);
    const ids = (res.body as { id: string }[]).map((u) => u.id);
    expect(ids).not.toContain(unitA.id);
  });

  it('cách ly tenant: list users/roles chỉ thấy của org mình', async () => {
    const usersRes = await request(app.getHttpServer())
      .get(`${PREFIX}/users?limit=100`)
      .set('Cookie', orgACookie)
      .expect(200);
    const emails = (usersRes.body.items as { email: string }[]).map((u) => u.email);
    expect(emails).toContain(`e2e-orga-user-${stamp}@example.com`);
    expect(emails).not.toContain(`e2e-orgb-user-${stamp}@example.com`);
    expect(emails).not.toContain(platformEmail);

    const rolesRes = await request(app.getHttpServer())
      .get(`${PREFIX}/roles?limit=100`)
      .set('Cookie', orgACookie)
      .expect(200);
    const roleNames = (rolesRes.body.items as { name: string }[]).map(
      (r) => r.name,
    );
    expect(roleNames).toContain(ORG_ROLES.ORG_ADMIN);
    expect(roleNames).not.toContain('SUPER_ADMIN');
  });

  it('org user gọi API platform (organizations) → 403; platform admin gọi org API → 403', async () => {
    await request(app.getHttpServer())
      .get(`${PREFIX}/organizations`)
      .set('Cookie', orgACookie)
      .expect(403);

    // Platform admin có mọi permission nhưng không có org context
    await request(app.getHttpServer())
      .get(`${PREFIX}/org-units`)
      .set('Cookie', platformCookie)
      .expect(403);
  });

  it('code đơn vị trùng nhau ở KHÁC nhánh cha được phép; cùng cha thì 409', async () => {
    const typesRes = await request(app.getHttpServer())
      .get(`${PREFIX}/org-unit-types`)
      .set('Cookie', orgACookie);
    const pbType = (typesRes.body as { code: string; id: string }[]).find(
      (t) => t.code === 'PHONG_BAN',
    )!;
    // 2 phòng ban dưới 2 nhà máy khác nhau
    const nm1 = await prisma.orgUnit.findFirstOrThrow({
      where: { orgId: orgAId, code: 'NM-01' },
    });
    const kn2 = await prisma.orgUnit.findFirstOrThrow({
      where: { orgId: orgAId, code: 'KN-02' },
    });

    // QTNNL dưới NM-01
    await request(app.getHttpServer())
      .post(`${PREFIX}/org-units`)
      .set('Cookie', orgACookie)
      .send({ name: 'Quản trị NNL', code: 'QTNNL', typeId: pbType.id, parentId: nm1.id })
      .expect(201);

    // QTNNL dưới KN-02 (khác nhánh) → vẫn được phép
    await request(app.getHttpServer())
      .post(`${PREFIX}/org-units`)
      .set('Cookie', orgACookie)
      .send({ name: 'Quản trị NNL', code: 'QTNNL', typeId: pbType.id, parentId: kn2.id })
      .expect(201);

    // QTNNL lần 2 dưới NM-01 (cùng cha) → 409
    await request(app.getHttpServer())
      .post(`${PREFIX}/org-units`)
      .set('Cookie', orgACookie)
      .send({ name: 'Trùng', code: 'QTNNL', typeId: pbType.id, parentId: nm1.id })
      .expect(409);
  });
});
