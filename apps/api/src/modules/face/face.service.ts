import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { FACE_ENGINE, type FaceEngine } from './face-engine';
import { bestMatch } from './face.matching';

export interface VerifyResult {
  matched: boolean;
  score: number;
  liveness: number;
  photoKey: string;
}

@Injectable()
export class FaceService {
  constructor(
    @Inject(FACE_ENGINE) private readonly engine: FaceEngine,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
  ) {}

  private assertReady(): void {
    if (!this.engine.isReady()) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Tính năng nhận diện khuôn mặt chưa sẵn sàng (thiếu model)',
        ERROR_CODES.FACE_ENGINE_UNAVAILABLE,
      );
    }
  }

  /** Trích embedding + kiểm tra chất lượng cho 1 ảnh enroll. */
  async extractEmbedding(image: Buffer): Promise<number[]> {
    this.assertReady();
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
    this.assertReady();
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

    const enrolled = profile.embeddings as number[][];
    const score = bestMatch(detection.embedding, enrolled);
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
