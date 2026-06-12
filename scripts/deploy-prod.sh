#!/usr/bin/env bash
# Deploy production một lệnh: build → hạ tầng → migrate+seed → app + proxy.
# Yêu cầu: .env production đầy đủ (DOMAIN, secrets thật, REDIS_PASSWORD...).
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"

if ! grep -qE '^DOMAIN=..*' .env; then
  echo "❌ Thiếu DOMAIN trong .env (vd DOMAIN=app.example.com)"
  exit 1
fi

echo "🔨 Build images (api, web)..."
$COMPOSE build

echo "🗄  Khởi động Postgres + Redis..."
$COMPOSE up -d postgres redis

echo "🚀 Apply migrations + seed (idempotent)..."
$COMPOSE run --rm migrate

echo "▶️  Khởi động api + web + caddy..."
$COMPOSE up -d api web caddy

DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2)
echo ""
echo "✅ Hoàn tất — https://${DOMAIN} (Caddy tự xin chứng chỉ trong ~30s đầu)"
$COMPOSE ps
