#!/usr/bin/env bash
# Tải model @vladmandic/human cho face check-in 1:1 về apps/api/models/.
# Chạy 1 lần trước khi bật tính năng khuôn mặt (hoặc trong bước build prod).
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="apps/api/models"
BASE="https://vladmandic.github.io/human-models/models"
mkdir -p "$DEST"

# Bộ model tối thiểu: phát hiện mặt + mesh + descriptor + antispoof + liveness
FILES=(
  blazeface.json blazeface.bin
  facemesh.json facemesh.bin
  faceres.json faceres.bin
  antispoof.json antispoof.bin
  liveness.json liveness.bin
)

echo "⏳ Tải model Human về $DEST ..."
for f in "${FILES[@]}"; do
  if [ -f "$DEST/$f" ]; then
    echo "  ✓ $f (đã có)"
  else
    echo "  ↓ $f"
    curl -fsSL "$BASE/$f" -o "$DEST/$f"
  fi
done
echo "✅ Hoàn tất. Đặt FACE_MODELS_PATH=./models (mặc định) trong .env."
