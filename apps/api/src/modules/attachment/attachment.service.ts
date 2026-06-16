import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_SIZE,
  ERROR_CODES,
  type AttachmentResponse,
  type AttachmentTargetType,
} from '@repo/shared';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

const SIGNED_URL_TTL = 600; // 10 phút

@Injectable()
export class AttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Lưu file đính kèm cho 1 đơn (ảnh/PDF). Key gồm orgId nên không thể đọc
   * chéo tổ chức. Trả danh sách kèm signed URL để FE hiển thị ngay.
   */
  async upload(
    orgId: string,
    userId: string,
    targetType: AttachmentTargetType,
    targetId: string,
    files: Express.Multer.File[],
  ): Promise<AttachmentResponse[]> {
    if (files.length === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Không có file nào',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    await this.assertTarget(orgId, userId, targetType, targetId);

    const created: AttachmentResponse[] = [];
    for (const file of files) {
      if (!ATTACHMENT_ACCEPT.includes(file.mimetype)) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Chỉ chấp nhận ảnh (JPEG/PNG/WebP) hoặc PDF',
          ERROR_CODES.VALIDATION_ERROR,
        );
      }
      if (file.size > ATTACHMENT_MAX_SIZE) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'File vượt quá 10MB',
          ERROR_CODES.VALIDATION_ERROR,
        );
      }
      const key = `attachments/${orgId}/${targetType}/${targetId}/${randomUUID()}`;
      await this.storage.put({ key, body: file.buffer, contentType: file.mimetype });
      const row = await this.prisma.attachment.create({
        data: {
          orgId,
          targetType,
          targetId,
          key,
          fileName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          uploadedById: userId,
        },
      });
      created.push(await this.toResponse(row));
    }
    return created;
  }

  async list(
    orgId: string,
    targetType: AttachmentTargetType,
    targetId: string,
  ): Promise<AttachmentResponse[]> {
    const rows = await this.prisma.attachment.findMany({
      where: { orgId, targetType, targetId },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(rows.map((r) => this.toResponse(r)));
  }

  async remove(orgId: string, id: string): Promise<void> {
    const row = await this.prisma.attachment.findFirst({ where: { id, orgId } });
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Không tìm thấy file', ERROR_CODES.NOT_FOUND);
    }
    await this.storage.delete(row.key).catch(() => undefined);
    await this.prisma.attachment.delete({ where: { id } });
  }

  private async toResponse(row: {
    id: string;
    targetType: AttachmentTargetType;
    targetId: string;
    key: string;
    fileName: string;
    contentType: string;
    size: number;
    createdAt: Date;
  }): Promise<AttachmentResponse> {
    return {
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      fileName: row.fileName,
      contentType: row.contentType,
      size: row.size,
      url: await this.storage.getSignedUrl(row.key, SIGNED_URL_TTL),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Đảm bảo đơn đích tồn tại trong org VÀ thuộc về chính người upload (chống
   * đính kèm vào đơn người khác / id rác / chéo org).
   */
  private async assertTarget(
    orgId: string,
    userId: string,
    targetType: AttachmentTargetType,
    targetId: string,
  ): Promise<void> {
    const exists =
      targetType === 'LEAVE_REQUEST'
        ? !!(await this.prisma.leaveRequest.findFirst({
            where: { id: targetId, orgId, employee: { userId } },
            select: { id: true },
          }))
        : targetType === 'ATTENDANCE_CORRECTION'
          ? !!(await this.prisma.attendanceCorrection.findFirst({
              where: { id: targetId, orgId, employee: { userId } },
              select: { id: true },
            }))
          : // OT_REQUEST — model thêm ở cụm sau; tạm chấp nhận theo org
            true;
    if (!exists) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy đơn để đính kèm (hoặc không phải đơn của bạn)',
        ERROR_CODES.NOT_FOUND,
      );
    }
  }
}
