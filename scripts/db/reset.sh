#!/usr/bin/env bash
# CHỈ DÙNG LOCAL: xoá sạch DB, migrate lại từ đầu + seed
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/_env.sh
if [ "${NODE_ENV:-development}" = "production" ]; then
  echo "❌ Không bao giờ reset DB production!"; exit 1
fi
pnpm --filter api exec prisma migrate reset --force
