#!/usr/bin/env bash
# Restore DB từ file backup: bash scripts/db/restore.sh backups/backup_xxx.dump
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/_env.sh
FILE="${1:?Usage: restore.sh <file.dump>}"
read -r -p "⚠️  Restore sẽ GHI ĐÈ dữ liệu hiện tại. Gõ 'yes' để tiếp tục: " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Đã huỷ."; exit 1; }
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$FILE"
echo "✅ Restore xong từ $FILE"
