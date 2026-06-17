/**
 * Đồng bộ role của MỌI org hiện có về bộ mặc định mới nhất (idempotent):
 * - Tạo role org còn thiếu (vd WORKER) theo ALL_ORG_ROLES
 * - THÊM (không xoá) các permission mặc định còn thiếu cho từng role org
 * Dùng khi DEFAULT_ORG_ROLE_PERMISSIONS / ORG_ROLES thay đổi mà org cũ chưa có.
 *
 * Chạy: `pnpm db:sync-roles`
 */
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ALL_ORG_ROLES,
  DEFAULT_ORG_ROLE_PERMISSIONS,
  ORG_ROLE_DESCRIPTIONS,
} from '@repo/shared';
import { PrismaClient } from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Thiếu DATABASE_URL');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main(): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  const perms = await prisma.permission.findMany({ select: { id: true, name: true } });
  const permId = new Map(perms.map((p) => [p.name, p.id]));

  for (const org of orgs) {
    for (const roleName of ALL_ORG_ROLES) {
      const role =
        (await prisma.role.findFirst({ where: { orgId: org.id, name: roleName } })) ??
        (await prisma.role.create({
          data: {
            name: roleName,
            orgId: org.id,
            isSystem: true,
            description: ORG_ROLE_DESCRIPTIONS[roleName],
          },
        }));
      const wantedIds = DEFAULT_ORG_ROLE_PERMISSIONS[roleName]
        .map((p) => permId.get(p))
        .filter((id): id is string => !!id);
      await prisma.rolePermission.createMany({
        data: wantedIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
    console.log(`✔ synced roles cho org ${org.name}`);
  }
  console.log(`Done: ${orgs.length} org(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
