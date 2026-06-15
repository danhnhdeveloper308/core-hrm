import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { decryptSecret, encryptSecret } from '../../common/utils/crypto';
import { AppConfigService } from '../../config/app-config.service';

export interface TotpSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

/** TOTP (otplib v13) — secret lưu DB dạng AES-256-GCM ciphertext. */
@Injectable()
export class TotpService {
  constructor(private readonly config: AppConfigService) {}

  async createSetup(email: string): Promise<TotpSetup> {
    const secret = generateSecret();
    const otpauthUrl = generateURI({
      issuer: this.config.totpIssuer,
      label: email,
      secret,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async verifyCode(secret: string, code: string): Promise<boolean> {
    const result = await verify({ secret, token: code });
    return result.valid;
  }

  encrypt(secret: string): string {
    return encryptSecret(secret, this.config.totpEncryptionKey);
  }

  decrypt(ciphertext: string): string {
    return decryptSecret(ciphertext, this.config.totpEncryptionKey);
  }
}
