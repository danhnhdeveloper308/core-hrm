import { listAttachmentsQuerySchema, uploadAttachmentSchema } from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class ListAttachmentsQueryDto extends createZodDto(listAttachmentsQuerySchema) {}
export class UploadAttachmentDto extends createZodDto(uploadAttachmentSchema) {}
