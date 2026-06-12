#!/usr/bin/env bash
# Seed dữ liệu chuẩn: roles, permissions, super admin
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/_env.sh
pnpm --filter api exec prisma db seed
