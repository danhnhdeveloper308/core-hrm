import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { STORAGE_PROVIDER } from './storage.provider';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => new S3StorageProvider(config.storage),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
