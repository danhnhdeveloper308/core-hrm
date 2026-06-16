/**
 * E2E Phase 5 — Face + Location check-in (FaceEngine mock — không cần model thật).
 * Mock detect(): byte đầu buffer quyết định "người" → embedding xác định:
 *   'A'(65) → [1,0,0]; 'B'(66) → [0,1,0]. Cùng người khớp ≥ threshold, khác người fail.
 * Acceptance: enroll + verify đúng/sai người; ngoài bán kính → OUT_OF_WORKSITE.
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ORG_ROLES } from '@repo/shared';
import argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { FACE_ENGINE, type FaceEngine } from '../src/modules/face/face-engine';
import { cosineSimilarity } from '../src/modules/face/face.matching';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailQueueService } from '../src/queues/email.queue';
import { StorageService } from '../src/storage/storage.service';

class StubEmailQueue {
  enqueueOtp() { return Promise.resolve(); }
  enqueueInvite() { return Promise.resolve(); }
  enqueueNewDeviceAlert() { return Promise.resolve(); }
}

/** AWS SDK dùng dynamic import → fail trong jest VM; stub storage để test. */
const stubStorage = {
  put: () => Promise.resolve(),
  getSignedUrl: (key: string) => Promise.resolve(`https://stub/${key}`),
  delete: () => Promise.resolve(),
};

/** Mock engine: embedding theo byte đầu, luôn live + 1 mặt + score cao. */
const mockEngine: FaceEngine = {
  isReady: () => true,
  ensureReady: () => Promise.resolve(true),
  similarity: (a, b) => cosineSimilarity(a, b),
  detect: (image: Buffer) => {
    const tag = image[11]; // tag person sau header JFIF
    const embedding =
      tag === 65 ? [1, 0, 0] : tag === 66 ? [0, 1, 0] : [0, 0, 1];
    return Promise.resolve({ embedding, faceScore: 0.95, liveness: 0.9, faceCount: 1 });
  },
};

const PREFIX = '/api';
// Header JFIF hợp lệ (qua file-type) + tag person ở offset 11
const img = (person: 'A' | 'B') =>
  Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
    person.charCodeAt(0), 0x01, 0x00, 0x00,
  ]);

function cookieOf(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr
    .map((c) => c.split(';')[0])
    .filter((p): p is string => !!p && p.includes('='))
    .join('; ');
}

describe('Face + Location check-in (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const password = 'TestPass123';
  let orgId: string;
  let empCookie: string;
  let employeeId: string;
  let worksiteId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailQueueService)
      .useValue(new StubEmailQueue())
      .overrideProvider(FACE_ENGINE)
      .useValue(mockEngine)
      .overrideProvider(StorageService)
      .useValue(stubStorage)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
    prisma = app.get(PrismaService);

    const org = await prisma.organization.create({
      data: { name: `Org Face ${stamp}`, slug: `e2e-face-${stamp}` },
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

    // Worksite tại HCM, bán kính 100m, yêu cầu cả face + location
    const worksite = await prisma.worksite.create({
      data: {
        orgId,
        name: 'VP HCM',
        lat: 10.776,
        lng: 106.7,
        radiusM: 100,
        requireFace: true,
        requireLocation: true,
      },
    });
    worksiteId = worksite.id;

    const empRole = await prisma.role.findFirstOrThrow({
      where: { orgId, name: ORG_ROLES.EMPLOYEE },
    });
    const user = await prisma.user.create({
      data: {
        email: `e2e-face-emp-${stamp}@example.com`,
        name: 'Face Emp',
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        orgId,
        roles: { create: { roleId: empRole.id } },
      },
    });
    const employee = await prisma.employee.create({
      data: { orgId, userId: user.id, code: 'NV-F', fullName: 'Face Emp', joinDate: new Date('2026-01-01'), worksiteId },
    });
    employeeId = employee.id;

    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/auth/login`)
      .send({ identifier: user.email, password })
      .expect(200);
    empCookie = cookieOf(res);
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  it('enroll 3 ảnh khuôn mặt (person A) → enrolledCount 3', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/face/enroll`)
      .set('Cookie', empCookie)
      .attach('photos', img('A'), 'a1.jpg')
      .attach('photos', img('A'), 'a2.jpg')
      .attach('photos', img('A'), 'a3.jpg')
      .expect(201);
    expect(res.body.enrolledCount).toBe(3);

    const profile = await prisma.faceProfile.findUnique({ where: { employeeId } });
    expect(profile).not.toBeNull();
  });

  it('enroll thiếu ảnh (2) → 400', async () => {
    await request(app.getHttpServer())
      .post(`${PREFIX}/face/enroll`)
      .set('Cookie', empCookie)
      .attach('photos', img('A'), 'a1.jpg')
      .attach('photos', img('A'), 'a2.jpg')
      .expect(400);
  });

  it('check-in ĐÚNG người + trong bán kính → thành công, source FACE', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/check`)
      .set('Cookie', empCookie)
      .field('lat', '10.7761')
      .field('lng', '106.7001')
      .attach('photo', img('A'), 'checkin.jpg')
      .expect(201);
    expect(res.body.source).toBe('FACE');
    expect(res.body.faceScore).toBeGreaterThanOrEqual(0.55);
  });

  it('check-in KHÁC người → FACE_NO_MATCH', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/check`)
      .set('Cookie', empCookie)
      .field('lat', '10.7761')
      .field('lng', '106.7001')
      .attach('photo', img('B'), 'checkin.jpg')
      .expect(422);
    expect(res.body.errorCode).toBe('FACE_NO_MATCH');
  });

  it('check-in NGOÀI bán kính → OUT_OF_WORKSITE', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/check`)
      .set('Cookie', empCookie)
      .field('lat', '10.79')
      .field('lng', '106.7')
      .attach('photo', img('A'), 'checkin.jpg')
      .expect(422);
    expect(res.body.errorCode).toBe('OUT_OF_WORKSITE');
  });

  it('check-in thiếu toạ độ → LOCATION_REQUIRED', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/attendance/check`)
      .set('Cookie', empCookie)
      .attach('photo', img('A'), 'checkin.jpg')
      .expect(400);
    expect(res.body.errorCode).toBe('LOCATION_REQUIRED');
  });
});
