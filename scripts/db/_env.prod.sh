#!/usr/bin/env bash
# Load .env.production (ở GỐC repo) cho các tác vụ DB chạy TỪ LOCAL → PRODUCTION.
# Tách hẳn khỏi .env (dev) để KHÔNG bao giờ nhầm DATABASE_URL localhost.
#
# .env.production cần tối thiểu:
#   DATABASE_URL="postgresql://…neon.tech/db?sslmode=require"   # (bọc nháy kép — có ký tự & ?)
#   SEED_ADMIN_EMAIL=...        # (nếu muốn seed)
#   SEED_ADMIN_PASSWORD=...
#   DIRECT_DATABASE_URL=...     # (tuỳ chọn) chuỗi UNPOOLED cho migrate (Neon khuyến nghị)
set -a
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
if [ ! -f "$ROOT/.env.production" ]; then
  echo "❌ Không tìm thấy .env.production ở gốc repo ($ROOT)." >&2
  echo "   Tạo: cp apps/api/env.production.example .env.production  (điền DATABASE_URL prod…)" >&2
  exit 1
fi
# shellcheck disable=SC1091
. "$ROOT/.env.production"
set +a

: "${DATABASE_URL:?DATABASE_URL chưa set trong .env.production}"
# Migrate Neon nên dùng chuỗi DIRECT (host KHÔNG có '-pooler'). Có DIRECT_DATABASE_URL → ưu tiên.
export MIGRATE_DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"

# In target (ẩn query string chứa credential/flags)
echo "🎯 PRODUCTION DB: ${DATABASE_URL%%\?*}"
