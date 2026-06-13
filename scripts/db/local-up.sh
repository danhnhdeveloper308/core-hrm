#!/usr/bin/env bash
# Khởi động Postgres + Redis local bằng docker, chờ healthy
set -euo pipefail
cd "$(dirname "$0")/../.."
docker compose up -d postgres redis minio
echo "⏳ Chờ Postgres healthy..."
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-app}" >/dev/null 2>&1; do sleep 1; done
echo "✅ Postgres + Redis + MinIO sẵn sàng."
