import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// .env nằm ở root monorepo. Khi chạy qua scripts/db/* thì env đã được export
// sẵn; dotenv ở đây để `prisma ...` chạy trực tiếp từ apps/api cũng hoạt động.
loadEnv({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Prisma 7: url khai báo ở config, không còn trong schema.prisma
    url: process.env.DATABASE_URL ?? '',
  },
});
