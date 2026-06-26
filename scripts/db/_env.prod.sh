#!/usr/bin/env bash
# Load .env.production cho các tác vụ DB chạy TỪ LOCAL → PRODUCTION.
# Tách hẳn khỏi .env (dev) để KHÔNG bao giờ nhầm DATABASE_URL localhost.
#
# Tìm file theo thứ tự: <root>/.env.production → <root>/apps/api/.env.production
# File cần (tối thiểu):
#   DATABASE_URL="postgresql://…neon.tech/db?sslmode=require"   # bọc NHÁY KÉP (có & ?)
#   SEED_ADMIN_EMAIL=...        SEED_ADMIN_PASSWORD=...          # nếu muốn seed
#   DIRECT_DATABASE_URL="…"     # (tuỳ chọn) chuỗi UNPOOLED cho migrate (Neon khuyến nghị)
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

ENV_FILE=""
for candidate in "$ROOT/.env.production" "$ROOT/apps/api/.env.production"; do
  if [ -f "$candidate" ]; then ENV_FILE="$candidate"; break; fi
done

if [ -z "$ENV_FILE" ]; then
  echo "❌ Không tìm thấy .env.production." >&2
  echo "   Tạo ở GỐC repo: cp apps/api/env.production.example .env.production" >&2
  echo "   rồi điền DATABASE_URL (+ SEED_ADMIN_* nếu seed). Đây là env BACKEND, KHÔNG phải env Vercel/FE." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL trống/không có trong: $ENV_FILE" >&2
  echo "   • Đảm bảo có dòng: DATABASE_URL=\"postgresql://…neon.tech/db?sslmode=require\"" >&2
  echo "   • PHẢI bọc nháy kép (vì URL chứa ký tự & và ?), không có khoảng trắng quanh dấu =." >&2
  echo "   • Lưu ý: file env của Vercel/FE chỉ có NEXT_PUBLIC_* → KHÔNG có DATABASE_URL." >&2
  exit 1
fi

# Migrate Neon nên dùng chuỗi DIRECT (host KHÔNG có '-pooler'). Có DIRECT_DATABASE_URL → ưu tiên.
export MIGRATE_DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"

echo "📄 Env: $ENV_FILE"
echo "🎯 PRODUCTION DB: ${DATABASE_URL%%\?*}"
