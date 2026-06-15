import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@repo/shared';
import { AppException } from '../../common/exceptions/app.exception';
import {
  generateOtpCode,
  generateStateToken,
  sha256,
} from '../../common/utils/crypto';
import { AppConfigService } from '../../config/app-config.service';
import type { VerificationType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailQueueService } from '../../queues/email.queue';

const MAX_ATTEMPTS = 5;

/** OTP 6 số qua email — lưu hash, đếm attempts, TTL từ env. */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly emailQueue: EmailQueueService,
  ) {}

  private hash(identifier: string, type: VerificationType, code: string): string {
    return sha256(`${identifier}:${type}:${code}`);
  }

  /** Tạo OTP mới (vô hiệu các OTP cũ cùng loại) và đẩy job gửi mail. */
  async issue(
    identifier: string,
    type: Exclude<VerificationType, 'INVITE'>,
  ): Promise<void> {
    await this.prisma.verificationToken.updateMany({
      where: { identifier, type, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = generateOtpCode();
    await this.prisma.verificationToken.create({
      data: {
        identifier,
        type,
        codeHash: this.hash(identifier, type, code),
        expiresAt: new Date(Date.now() + this.config.otpTtlSeconds * 1_000),
      },
    });

    await this.emailQueue.enqueueOtp({ to: identifier, code, kind: type });
  }

  /**
   * Token lời mời (type INVITE, TTL 7 ngày) — trả raw token để nhúng vào
   * link email. Consume bằng cùng hàm consume() bên dưới.
   */
  async issueInviteToken(identifier: string): Promise<string> {
    await this.prisma.verificationToken.updateMany({
      where: { identifier, type: 'INVITE', consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const token = generateStateToken();
    await this.prisma.verificationToken.create({
      data: {
        identifier,
        type: 'INVITE',
        codeHash: this.hash(identifier, 'INVITE', token),
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    return token;
  }

  /** Kiểm tra + consume OTP — sai/hết hạn/quá 5 lần đều throw AppException. */
  async consume(
    identifier: string,
    type: VerificationType,
    code: string,
  ): Promise<void> {
    const token = await this.prisma.verificationToken.findFirst({
      where: { identifier, type, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Mã OTP không hợp lệ',
        ERROR_CODES.AUTH_OTP_INVALID,
      );
    }

    if (token.expiresAt < new Date()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Mã OTP đã hết hạn, vui lòng yêu cầu mã mới',
        ERROR_CODES.AUTH_OTP_EXPIRED,
      );
    }

    if (token.attempts >= MAX_ATTEMPTS) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Nhập sai quá 5 lần, vui lòng yêu cầu mã mới',
        ERROR_CODES.AUTH_OTP_MAX_ATTEMPTS,
      );
    }

    if (token.codeHash !== this.hash(identifier, type, code)) {
      const updated = await this.prisma.verificationToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      const remaining = MAX_ATTEMPTS - updated.attempts;
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        remaining > 0
          ? `Mã OTP không đúng (còn ${remaining} lần thử)`
          : 'Nhập sai quá 5 lần, vui lòng yêu cầu mã mới',
        remaining > 0
          ? ERROR_CODES.AUTH_OTP_INVALID
          : ERROR_CODES.AUTH_OTP_MAX_ATTEMPTS,
      );
    }

    await this.prisma.verificationToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });
  }
}
