export interface FaceDetection {
  /** Embedding/descriptor của khuôn mặt (human: vector ~1024d). */
  embedding: number[];
  /** Điểm tin cậy phát hiện khuôn mặt [0,1]. */
  faceScore: number;
  /** Điểm liveness antispoof [0,1] — càng cao càng thật. */
  liveness: number;
  /** Số khuôn mặt phát hiện trong ảnh. */
  faceCount: number;
}

/**
 * Trừu tượng engine khuôn mặt — cô lập @vladmandic/human (dep nặng) khỏi
 * logic nghiệp vụ, cho phép mock trong test (pattern như StorageProvider).
 */
export interface FaceEngine {
  /** null khi không phát hiện được khuôn mặt nào. */
  detect(image: Buffer): Promise<FaceDetection | null>;
  /**
   * Độ tương đồng 2 embedding [0,1] theo metric của engine (Human tinh chỉnh
   * cho descriptor faceres — phân biệt tốt hơn cosine thô). 1 = trùng khớp.
   */
  similarity(a: number[], b: number[]): number;
  /** Trigger lazy-load nếu cần; false khi không load được model (thiếu file...). */
  ensureReady(): Promise<boolean>;
  /** Trạng thái hiện tại (không trigger load) — dùng cho healthcheck. */
  isReady(): boolean;
}

export const FACE_ENGINE = 'FACE_ENGINE';
