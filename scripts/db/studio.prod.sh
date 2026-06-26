#!/usr/bin/env bash
# Mở Prisma Studio trỏ vào DB PRODUCTION (xem/sửa nhanh). CẨN THẬN chỉnh tay!
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/_env.prod.sh

echo "🔎 Prisma Studio → PRODUCTION. Mọi thay đổi áp THẲNG lên DB thật."
pnpm --filter api exec prisma studio
