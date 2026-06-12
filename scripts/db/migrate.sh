#!/usr/bin/env bash
# Dev migration: tạo + apply migration mới (Prisma)
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/_env.sh
NAME="${1:-}"
if [ -n "$NAME" ]; then
  pnpm --filter api exec prisma migrate dev --name "$NAME"
else
  pnpm --filter api exec prisma migrate dev
fi
