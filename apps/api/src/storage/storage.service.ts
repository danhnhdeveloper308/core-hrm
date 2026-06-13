import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { STORAGE_PROVIDER } from './storage.provider';
import type { PutObjectInput, StorageProvider } from './storage.provider';

/**
 * Facade duy nhất các module nghiệp vụ dùng để đụng object storage.
 * Key convention: `{orgId}/checkin/{employeeId}/{date}/...`, `{orgId}/docs/...`
 * — orgId đứng đầu để cách ly tenant.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.provider instanceof S3StorageProvider) {
      try {
        await this.provider.ensureBucket();
        this.logger.log('Storage bucket sẵn sàng');
      } catch (err) {
        // Không chặn boot — storage lỗi chỉ làm hỏng tính năng file, không phải cả app
        this.logger.error(`Không tạo/kiểm tra được bucket: ${(err as Error).message}`);
      }
    }
  }

  put(input: PutObjectInput): Promise<void> {
    return this.provider.put(input);
  }

  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return this.provider.getSignedUrl(key, expiresInSeconds);
  }

  delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }
}
