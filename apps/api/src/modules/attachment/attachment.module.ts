import { Module } from '@nestjs/common';
import { AttachmentController } from './attachment.controller';
import { AttachmentService } from './attachment.service';

/** StorageService là @Global nên không cần import StorageModule. */
@Module({
  controllers: [AttachmentController],
  providers: [AttachmentService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
