import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import type { FaceDetection, FaceEngine } from './face-engine';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Engine thật dùng @vladmandic/human + @tensorflow/tfjs-node (CPU backend).
 * Lazy-load model lần đầu detect; thiếu model/tf → isReady()=false để endpoint
 * face trả 503 rõ ràng thay vì crash (pattern optional provider).
 *
 * Model tải về apps/api/models/ bằng scripts/download-face-models.sh.
 */
export class HumanFaceEngine implements FaceEngine {
  private readonly logger = new Logger(HumanFaceEngine.name);
  private human: any | null = null;
  private tf: any | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly modelsPath: string,
    private readonly _antispoofThreshold: number,
  ) {}

  isReady(): boolean {
    return this.ready;
  }

  async ensureReady(): Promise<boolean> {
    await this.ensureLoaded();
    return this.ready;
  }

  /** Human match.similarity — tinh chỉnh cho descriptor faceres (tốt hơn cosine). */
  similarity(a: number[], b: number[]): number {
    if (!this.human?.match?.similarity || a.length === 0 || b.length === 0) return 0;
    return this.human.match.similarity(a, b);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.ready) return;
    this.initPromise ??= this.load();
    await this.initPromise;
  }

  private async load(): Promise<void> {
    const modelBasePath = resolve(this.modelsPath);
    if (!existsSync(modelBasePath)) {
      this.logger.warn(
        `Thư mục model không tồn tại (${modelBasePath}) — face check-in tắt. ` +
          'Chạy scripts/download-face-models.sh để bật.',
      );
      return;
    }
    try {
      // Import động: tránh kéo tfjs vào process không cần (vd jest unit)
      this.tf = await import('@tensorflow/tfjs-node');
      const mod: any = await import('@vladmandic/human');
      const HumanCtor = mod.Human ?? mod.default?.Human ?? mod.default;
      this.human = new HumanCtor({
        backend: 'tensorflow',
        modelBasePath: `file://${modelBasePath}/`,
        cacheSensitivity: 0,
        face: {
          enabled: true,
          detector: { rotation: false, maxDetected: 5, return: false },
          description: { enabled: true },
          antispoof: { enabled: true },
          liveness: { enabled: true },
          mesh: { enabled: true },
          iris: { enabled: false },
          emotion: { enabled: false },
        },
        body: { enabled: false },
        hand: { enabled: false },
        gesture: { enabled: false },
        filter: { enabled: true, equalization: false },
      });
      await this.human.load();
      await this.human.warmup();
      this.ready = true;
      this.logger.log('Human face engine sẵn sàng (TFJS Node CPU)');
    } catch (err) {
      this.logger.error(`Không load được Human: ${(err as Error).message}`);
    }
  }

  async detect(image: Buffer): Promise<FaceDetection | null> {
    await this.ensureLoaded();
    if (!this.ready || !this.human || !this.tf) return null;

    const tensor = this.tf.node.decodeImage(image, 3);
    try {
      const result = await this.human.detect(tensor);
      const faces = (result.face ?? []) as any[];
      if (faces.length === 0) return null;
      const face = faces.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      const embedding: number[] = Array.from(face.embedding ?? []);
      return {
        embedding,
        faceScore: face.faceScore ?? face.score ?? 0,
        // human: face.real (antispoof) + face.live (liveness) — lấy min cho an toàn
        liveness: Math.min(face.real ?? 1, face.live ?? 1),
        faceCount: faces.length,
      };
    } finally {
      if (tensor && typeof tensor.dispose === 'function') tensor.dispose();
    }
  }
}
