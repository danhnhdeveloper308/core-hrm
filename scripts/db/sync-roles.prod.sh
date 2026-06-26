#!/usr/bin/env bash
# Đồng bộ role org của mọi org PRODUCTION về bộ mặc định mới nhất (idempotent).
# Chạy sau khi đổi default permission/role rồi deploy.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/_env.prod.sh

echo "→ build @repo/shared"
pnpm --filter @repo/shared build >/dev/null
pnpm --filter api exec tsx prisma/sync-org-roles.ts
echo "✅ Sync roles production hoàn tất."
