#!/usr/bin/env bash
# Apply migration đã commit lên PRODUCTION (không tạo mới, không reset).
# Dùng MIGRATE_DATABASE_URL (DIRECT/unpooled nếu có) cho prisma migrate.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/_env.prod.sh

echo "🚀 Migrate deploy → ${MIGRATE_DATABASE_URL%%\?*}"
DATABASE_URL="$MIGRATE_DATABASE_URL" pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma generate >/dev/null
echo "✅ Migrate production hoàn tất."
