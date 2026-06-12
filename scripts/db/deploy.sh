#!/usr/bin/env bash
# PRODUCTION: chỉ apply migration đã commit, không tạo mới, không reset
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/_env.sh
echo "🚀 Apply migrations lên: ${DATABASE_URL%%\?*}"
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma generate
echo "✅ Migrate production hoàn tất."
