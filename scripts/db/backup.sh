#!/usr/bin/env bash
# Backup DB (dùng được cả local & production qua DATABASE_URL)
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/_env.sh
mkdir -p backups
FILE="backups/backup_$(date +%Y%m%d_%H%M%S).dump"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$FILE"
echo "✅ Backup: $FILE"
