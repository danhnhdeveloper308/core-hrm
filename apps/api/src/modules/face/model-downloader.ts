import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';

/**
 * Bộ model tối thiểu cho @vladmandic/human (face check-in 1:1 + 1:N):
 * phát hiện mặt + mesh + descriptor + antispoof + liveness.
 * Trùng danh sách trong scripts/download-face-models.sh.
 */
const MODEL_FILES = [
  'blazeface.json',
  'blazeface.bin',
  'facemesh.json',
  'facemesh.bin',
  'faceres.json',
  'faceres.bin',
  'antispoof.json',
  'antispoof.bin',
  'liveness.json',
  'liveness.bin',
];

const logger = new Logger('FaceModelDownloader');

/** Đủ model chưa (thư mục tồn tại + có mặt tất cả file). */
export function modelsPresent(dir: string): boolean {
  return existsSync(dir) && MODEL_FILES.every((f) => existsSync(join(dir, f)));
}

/**
 * Tự tải model về `dir` từ `baseUrl` (chỉ tải file còn thiếu). Cross-platform
 * (dùng global fetch của Node, không phụ thuộc bash/curl) → tiện cho deploy
 * trên mọi nền tảng (Render/Railway/Fly/VPS...). Trả true nếu đủ model sau khi tải.
 */
export async function ensureModelsDownloaded(
  dir: string,
  baseUrl: string,
): Promise<boolean> {
  if (modelsPresent(dir)) return true;
  await mkdir(dir, { recursive: true });
  const base = baseUrl.replace(/\/+$/, '');

  logger.log(`Thiếu model — tự tải về ${dir} từ ${base} ...`);
  try {
    for (const file of MODEL_FILES) {
      const dest = join(dir, file);
      if (existsSync(dest)) continue;
      const res = await fetch(`${base}/${file}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} khi tải ${file}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
      logger.log(`  ↓ ${file} (${(buf.length / 1024).toFixed(0)} KB)`);
    }
    logger.log('Tải model khuôn mặt hoàn tất');
    return modelsPresent(dir);
  } catch (err) {
    logger.error(`Tải model thất bại: ${(err as Error).message}`);
    return false;
  }
}
