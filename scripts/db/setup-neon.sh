#!/usr/bin/env bash
# =============================================================================
# Build database trên Neon (hoặc Postgres cloud bất kỳ): migrate deploy + seed.
# KHÔNG source .env (tránh đè bằng DATABASE_URL localhost của dev).
#
# CÁCH CHẠY (truyền biến trực tiếp):
#   DATABASE_URL='postgresql://…neon.tech/neondb?sslmode=require' \
#   SEED_ADMIN_EMAIL='admin@congty.com' SEED_ADMIN_PASSWORD='MatKhauManh@123' \
#     bash scripts/db/setup-neon.sh
#
# LƯU Ý:
#  - MIGRATE: dùng chuỗi UNPOOLED của Neon (host KHÔNG có '-pooler'), chỉ sslmode=require
#    (bỏ channel_binding để tránh lỗi với node-postgres). App runtime mới dùng POOLED.
#  - Bỏ SEED_ADMIN_* → chỉ migrate, không seed (chạy seed sau cũng được, idempotent).
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${DATABASE_URL:?Cần DATABASE_URL — khuyến nghị chuỗi UNPOOLED của Neon (?sslmode=require)}"
export DATABASE_URL

echo "🏗  Target DB: ${DATABASE_URL%%\?*}"

echo "→ [1/4] build @repo/shared (seed import từ đây)"
pnpm --filter @repo/shared build >/dev/null

echo "→ [2/4] prisma migrate deploy (áp toàn bộ migration đã commit)"
pnpm --filter api exec prisma migrate deploy

echo "→ [3/4] prisma generate"
pnpm --filter api exec prisma generate >/dev/null

if [[ -n "${SEED_ADMIN_EMAIL:-}" && -n "${SEED_ADMIN_PASSWORD:-}" ]]; then
  export SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD
  echo "→ [4/4] seed: permissions + system roles + SUPER_ADMIN ($SEED_ADMIN_EMAIL)"
  pnpm --filter api exec tsx prisma/seed.ts
else
  echo "⏭  [4/4] BỎ QUA seed (chưa set SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD)."
  echo "   Seed sau: SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… bash scripts/db/setup-neon.sh"
fi

echo "✅ Hoàn tất build database."
