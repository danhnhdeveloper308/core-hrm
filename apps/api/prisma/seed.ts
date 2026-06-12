/**
 * Seed dữ liệu chuẩn — idempotent, chạy lại bao nhiêu lần cũng được:
 * 1. Upsert toàn bộ permissions từ @repo/shared
 * 2. Upsert 3 system roles + sync đúng map role→permissions mặc định
 * 3. Tạo SUPER_ADMIN user từ SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *
 * Chạy: `pnpm db:seed` (hoặc `prisma db seed` từ apps/api).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ALL_PERMISSIONS,
  ALL_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_DESCRIPTIONS,
  ROLES,
} from '@repo/shared';
import argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Thiếu DATABASE_URL — kiểm tra .env ở root monorepo');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function seedPermissions(): Promise<Map<string, string>> {
  const idByName = new Map<string, string>();
  for (const name of ALL_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { name },
      update: { description: PERMISSION_DESCRIPTIONS[name] },
      create: { name, description: PERMISSION_DESCRIPTIONS[name] },
    });
    idByName.set(name, permission.id);
  }
  console.log(`✔ ${idByName.size} permissions`);
  return idByName;
}

async function seedRoles(permissionIdByName: Map<string, string>) {
  for (const roleName of ALL_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { description: ROLE_DESCRIPTIONS[roleName], isSystem: true },
      create: {
        name: roleName,
        description: ROLE_DESCRIPTIONS[roleName],
        isSystem: true,
      },
    });

    const wantedIds = DEFAULT_ROLE_PERMISSIONS[roleName].map((p) => {
      const id = permissionIdByName.get(p);
      if (!id) throw new Error(`Permission chưa được seed: ${p}`);
      return id;
    });

    // Sync chính xác theo map mặc định: xoá thừa, thêm thiếu
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: wantedIds } },
    });
    await prisma.rolePermission.createMany({
      data: wantedIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
  console.log(`✔ ${ALL_ROLES.length} system roles + role-permissions`);
}

async function seedSuperAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Thiếu SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD trong .env — bắt buộc để tạo SUPER_ADMIN',
    );
  }

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: ROLES.SUPER_ADMIN },
  });

  const existing = await prisma.user.findUnique({ where: { email } });
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email,
        name: 'Super Admin',
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    }));

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: user.id, roleId: superAdminRole.id },
  });

  console.log(
    existing
      ? `✔ SUPER_ADMIN đã tồn tại: ${email} (giữ nguyên mật khẩu cũ)`
      : `✔ Tạo SUPER_ADMIN: ${email}`,
  );
}

async function main() {
  const permissionIdByName = await seedPermissions();
  await seedRoles(permissionIdByName);
  await seedSuperAdmin();
}

main()
  .catch((error: unknown) => {
    console.error('Seed thất bại:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
