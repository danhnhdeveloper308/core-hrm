#!/usr/bin/env bash
# Build DB PRODUCTION 1 phát từ local: migrate deploy + (tuỳ chọn) seed.
# Tương đương setup-neon.sh nhưng đọc DATABASE_URL từ .env.production.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/_env.prod.sh

read -rp "⚠️  Migrate + seed lên PRODUCTION. Gõ 'yes' để xác nhận: " ans
[ "$ans" = "yes" ] || { echo "Đã huỷ."; exit 1; }

echo "→ [1/4] build @repo/shared"
pnpm --filter @repo/shared build >/dev/null
echo "→ [2/4] prisma migrate deploy (${MIGRATE_DATABASE_URL%%\?*})"
DATABASE_URL="$MIGRATE_DATABASE_URL" pnpm --filter api exec prisma migrate deploy
echo "→ [3/4] prisma generate"
pnpm --filter api exec prisma generate >/dev/null
if [[ -n "${SEED_ADMIN_EMAIL:-}" && -n "${SEED_ADMIN_PASSWORD:-}" ]]; then
  echo "→ [4/4] seed: permissions + roles + SUPER_ADMIN ($SEED_ADMIN_EMAIL)"
  pnpm --filter api exec tsx prisma/seed.ts
else
  echo "⏭  [4/4] BỎ QUA seed (chưa set SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD)."
fi
echo "✅ Hoàn tất build database production."
