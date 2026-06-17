#!/usr/bin/env bash
# Đồng bộ role org của mọi org về bộ mặc định mới nhất (idempotent)
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/_env.sh
pnpm --filter api exec tsx prisma/sync-org-roles.ts
