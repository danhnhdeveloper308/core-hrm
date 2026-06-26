import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ERROR_CODES } from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { FACE_ENGINE, type FaceEngine } from './face-engine';

export interface VerifyResult {
  matched: boolean;
  score: number;
  liveness: number;
  photoKey: string;
}

@Injectable()
export class FaceService implements OnModuleInit {
  private readonly logger = new Logger(FaceService.name);

  constructor(
    @Inject(FACE_ENGINE) private readonly engine: FaceEngine,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
  ) {}

  /** Warmup model nền lúc boot — lần enroll/verify đầu không phải chờ load. */
  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    void this.engine
      .ensureReady()
      .then((ok) =>
        ok
          ? this.logger.log('Face engine warmup xong')
          : this.logger.warn('Face engine chưa sẵn sàng (thiếu model?)'),
      )
      .catch((err) => this.logger.error(`Face warmup lỗi: ${(err as Error).message}`));
  }

  /** Trigger lazy-load + ném 503 nếu engine không sẵn sàng (thiếu model). */
  private async assertReady(): Promise<void> {
    if (!(await this.engine.ensureReady())) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Tính năng nhận diện khuôn mặt chưa sẵn sàng (thiếu model)',
        ERROR_CODES.FACE_ENGINE_UNAVAILABLE,
      );
    }
  }

  /** Trích embedding + kiểm tra chất lượng cho 1 ảnh enroll. */
  async extractEmbedding(image: Buffer): Promise<number[]> {
    await this.assertReady();
    const detection = await this.engine.detect(image);
    if (!detection) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Không phát hiện khuôn mặt trong ảnh',
        ERROR_CODES.FACE_NO_FACE,
      );
    }
    if (detection.faceCount > 1) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Ảnh có nhiều hơn 1 khuôn mặt',
        ERROR_CODES.FACE_MULTIPLE_FACES,
      );
    }
    if (detection.faceScore < this.config.face.enrollMinScore) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Ảnh quá mờ/nghiêng — vui lòng chụp rõ mặt, nhìn thẳng',
        ERROR_CODES.FACE_QUALITY_LOW,
      );
    }
    if (detection.embedding.length === 0) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Không trích được đặc trưng khuôn mặt',
        ERROR_CODES.FACE_QUALITY_LOW,
      );
    }
    return detection.embedding;
  }

  /** Đăng ký khuôn mặt: 3–5 ảnh → embeddings + lưu ảnh. */
  async enroll(
    orgId: string,
    employeeId: string,
    images: Buffer[],
    actorId: string,
  ): Promise<{ enrolledCount: number }> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, orgId },
      select: { id: true },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy nhân viên',
        ERROR_CODES.NOT_FOUND,
      );
    }

    const embeddings: number[][] = [];
    const photoKeys: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const embedding = await this.extractEmbedding(images[i]!);
      embeddings.push(embedding);
      const key = `${orgId}/face/${employeeId}/enroll-${Date.now()}-${i}.jpg`;
      await this.storage.put({ key, body: images[i]!, contentType: 'image/jpeg' });
      photoKeys.push(key);
    }

    // Thay toàn bộ profile cũ (xoá ảnh cũ trên storage)
    const existing = await this.prisma.faceProfile.findUnique({
      where: { employeeId },
    });
    if (existing) {
      await Promise.all(
        existing.photoKeys.map((k) => this.storage.delete(k).catch(() => undefined)),
      );
    }

    await this.prisma.faceProfile.upsert({
      where: { employeeId },
      create: { orgId, employeeId, embeddings, photoKeys, updatedBy: actorId },
      update: { embeddings, photoKeys, updatedBy: actorId, enrolledAt: new Date() },
    });

    addAuditMetadata({ after: { employeeId, enrolledCount: embeddings.length } });
    return { enrolledCount: embeddings.length };
  }

  /**
   * Xác thực 1:1 khi check-in: so embedding ảnh với các embedding đã enroll
   * của CHÍNH nhân viên đó. Lưu ảnh check-in (HR đối soát). Antispoof gate.
   */
  async verify(
    orgId: string,
    employeeId: string,
    image: Buffer,
  ): Promise<VerifyResult> {
    await this.assertReady();
    const profile = await this.prisma.faceProfile.findUnique({
      where: { employeeId },
    });
    if (!profile) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Nhân viên chưa đăng ký khuôn mặt',
        ERROR_CODES.FACE_NOT_ENROLLED,
      );
    }

    const detection = await this.engine.detect(image);
    if (!detection) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Không phát hiện khuôn mặt',
        ERROR_CODES.FACE_NO_FACE,
      );
    }
    if (detection.liveness < this.config.face.antispoofThreshold) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Nghi ngờ ảnh giả mạo (không phải người thật trước camera)',
        ERROR_CODES.FACE_SPOOF_SUSPECTED,
      );
    }

    // Khớp 1:1 với từng embedding đã enroll, lấy điểm cao nhất (metric engine)
    const enrolled = profile.embeddings as number[][];
    const score = enrolled.reduce(
      (best, e) => Math.max(best, this.engine.similarity(detection.embedding, e)),
      0,
    );
    const matched = score >= this.config.face.matchThreshold;

    const date = new Date().toISOString().slice(0, 10);
    const photoKey = `${orgId}/checkin/${employeeId}/${date}/${Date.now()}.jpg`;
    await this.storage.put({ key: photoKey, body: image, contentType: 'image/jpeg' });

    if (!matched) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Khuôn mặt không khớp với hồ sơ',
        ERROR_CODES.FACE_NO_MATCH,
        { score, photoKey },
      );
    }
    return { matched, score, liveness: detection.liveness, photoKey };
  }

  /**
   * Nhận diện 1:N (kiosk public): so embedding ảnh với TẤT CẢ hồ sơ khuôn mặt
   * trong org, chọn người có điểm cao nhất ≥ ngưỡng. Antispoof gate trước.
   */
  async identify(
    orgId: string,
    image: Buffer,
  ): Promise<{ employeeId: string; score: number; liveness: number; photoKey: string }> {
    await this.assertReady();
    const detection = await this.engine.detect(image);
    if (!detection) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Không phát hiện khuôn mặt',
        ERROR_CODES.FACE_NO_FACE,
      );
    }
    if (detection.liveness < this.config.face.antispoofThreshold) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Nghi ngờ ảnh giả mạo (không phải người thật trước camera)',
        ERROR_CODES.FACE_SPOOF_SUSPECTED,
      );
    }

    // Lưu ảnh trước (HR đối soát kể cả khi không khớp)
    const photoKey = `${orgId}/kiosk/${new Date().toISOString().slice(0, 10)}/${Date.now()}.jpg`;
    await this.storage.put({ key: photoKey, body: image, contentType: 'image/jpeg' });

    const profiles = await this.prisma.faceProfile.findMany({
      where: { orgId },
      select: { employeeId: true, embeddings: true },
    });
    let bestId: string | null = null;
    let bestScore = 0;
    for (const p of profiles) {
      const enrolled = p.embeddings as number[][];
      const score = enrolled.reduce(
        (best, e) => Math.max(best, this.engine.similarity(detection.embedding, e)),
        0,
      );
      if (score > bestScore) {
        bestScore = score;
        bestId = p.employeeId;
      }
    }

    if (!bestId || bestScore < this.config.face.matchThreshold) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Không nhận diện được khuôn mặt — thử lại hoặc liên hệ HR đăng ký khuôn mặt',
        ERROR_CODES.FACE_NO_MATCH,
        { score: bestScore, photoKey },
      );
    }
    return { employeeId: bestId, score: bestScore, liveness: detection.liveness, photoKey };
  }

  async getStatus(
    orgId: string,
    employeeId: string,
  ): Promise<{ enrolled: boolean; enrolledCount: number; enrolledAt: string | null }> {
    const profile = await this.prisma.faceProfile.findFirst({
      where: { employeeId, orgId },
    });
    return {
      enrolled: profile !== null,
      enrolledCount: profile ? (profile.embeddings as number[][]).length : 0,
      enrolledAt: profile?.enrolledAt.toISOString() ?? null,
    };
  }

  /** Ảnh khuôn mặt đã đăng ký (signed URL) — cho user xem lại / quản lý. */
  async listPhotos(
    orgId: string,
    employeeId: string,
  ): Promise<{ index: number; url: string }[]> {
    const profile = await this.prisma.faceProfile.findFirst({
      where: { employeeId, orgId },
    });
    if (!profile) return [];
    return Promise.all(
      profile.photoKeys.map(async (k, index) => ({
        index,
        url: await this.storage.getSignedUrl(k, 3600),
      })),
    );
  }

  /**
   * Thêm ảnh khuôn mặt (append) — GIỮ TỐI ĐA 5 ảnh: nếu vượt thì GHI ĐÈ ảnh cũ
   * nhất (xoá storage). Tạo profile nếu chưa có. 5 ảnh đã đủ để nhận diện.
   */
  async addPhotos(
    orgId: string,
    employeeId: string,
    images: Buffer[],
    actorId: string,
  ): Promise<{ enrolledCount: number }> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, orgId },
      select: { id: true },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy nhân viên',
        ERROR_CODES.NOT_FOUND,
      );
    }

    const existing = await this.prisma.faceProfile.findUnique({
      where: { employeeId },
    });
    let embeddings: number[][] = existing
      ? (existing.embeddings as number[][])
      : [];
    let photoKeys: string[] = existing ? existing.photoKeys : [];

    for (let i = 0; i < images.length; i++) {
      const embedding = await this.extractEmbedding(images[i]!);
      const key = `${orgId}/face/${employeeId}/enroll-${Date.now()}-${i}.jpg`;
      await this.storage.put({ key, body: images[i]!, contentType: 'image/jpeg' });
      embeddings = [...embeddings, embedding];
      photoKeys = [...photoKeys, key];
    }

    // Cap 5: bỏ ảnh CŨ NHẤT (đầu mảng), xoá storage tương ứng
    if (photoKeys.length > 5) {
      const drop = photoKeys.length - 5;
      await Promise.all(
        photoKeys.slice(0, drop).map((k) => this.storage.delete(k).catch(() => undefined)),
      );
      embeddings = embeddings.slice(drop);
      photoKeys = photoKeys.slice(drop);
    }

    await this.prisma.faceProfile.upsert({
      where: { employeeId },
      create: { orgId, employeeId, embeddings, photoKeys, updatedBy: actorId },
      update: { embeddings, photoKeys, updatedBy: actorId, enrolledAt: new Date() },
    });
    addAuditMetadata({ after: { employeeId, enrolledCount: photoKeys.length } });
    return { enrolledCount: photoKeys.length };
  }

  /** Xoá 1 ảnh theo vị trí (kèm embedding tương ứng). Hết ảnh → xoá profile. */
  async deletePhoto(
    orgId: string,
    employeeId: string,
    index: number,
  ): Promise<{ enrolledCount: number }> {
    const profile = await this.prisma.faceProfile.findFirst({
      where: { employeeId, orgId },
    });
    if (!profile) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Nhân viên chưa đăng ký khuôn mặt',
        ERROR_CODES.FACE_NOT_ENROLLED,
      );
    }
    if (index < 0 || index >= profile.photoKeys.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Ảnh không tồn tại',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const removedKey = profile.photoKeys[index]!;
    const photoKeys = profile.photoKeys.filter((_, i) => i !== index);
    const embeddings = (profile.embeddings as number[][]).filter((_, i) => i !== index);
    await this.storage.delete(removedKey).catch(() => undefined);

    if (photoKeys.length === 0) {
      await this.prisma.faceProfile.delete({ where: { id: profile.id } });
    } else {
      await this.prisma.faceProfile.update({
        where: { id: profile.id },
        data: { embeddings, photoKeys },
      });
    }
    addAuditMetadata({ after: { employeeId, removedIndex: index, remaining: photoKeys.length } });
    return { enrolledCount: photoKeys.length };
  }

  async deleteProfile(orgId: string, employeeId: string): Promise<{ message: string }> {
    const profile = await this.prisma.faceProfile.findFirst({
      where: { employeeId, orgId },
    });
    if (!profile) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Nhân viên chưa đăng ký khuôn mặt',
        ERROR_CODES.FACE_NOT_ENROLLED,
      );
    }
    await Promise.all(
      profile.photoKeys.map((k) => this.storage.delete(k).catch(() => undefined)),
    );
    await this.prisma.faceProfile.delete({ where: { id: profile.id } });
    addAuditMetadata({ before: { employeeId } });
    return { message: 'Đã xoá dữ liệu khuôn mặt' };
  }
}
