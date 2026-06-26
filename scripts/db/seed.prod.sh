#!/usr/bin/env bash
# Seed PRODUCTION từ local: permissions + system roles + SUPER_ADMIN (idempotent).
# Cần SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD trong .env.production.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/_env.prod.sh

: "${SEED_ADMIN_EMAIL:?Cần SEED_ADMIN_EMAIL trong .env.production}"
: "${SEED_ADMIN_PASSWORD:?Cần SEED_ADMIN_PASSWORD trong .env.production}"

read -rp "⚠️  Seed lên PRODUCTION ($SEED_ADMIN_EMAIL). Gõ 'yes' để xác nhận: " ans
[ "$ans" = "yes" ] || { echo "Đã huỷ."; exit 1; }

echo "→ build @repo/shared (seed import từ đây)"
pnpm --filter @repo/shared build >/dev/null
pnpm --filter api exec prisma generate >/dev/null
echo "→ seed…"
pnpm --filter api exec tsx prisma/seed.ts
echo "✅ Seed production hoàn tất."
