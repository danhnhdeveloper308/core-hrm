#!/usr/bin/env bash
# Load .env vào shell — được source bởi các script khác
set -a
[ -f "$(git rev-parse --show-toplevel 2>/dev/null || echo .)/.env" ] && \
  . "$(git rev-parse --show-toplevel 2>/dev/null || echo .)/.env"
set +a
: "${DATABASE_URL:?DATABASE_URL chưa được set trong .env}"
