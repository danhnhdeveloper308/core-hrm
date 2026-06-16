import { z } from 'zod';

export const attachmentTargetTypeSchema = z.enum([
  'LEAVE_REQUEST',
  'ATTENDANCE_CORRECTION',
  'OT_REQUEST',
]);
export type AttachmentTargetType = z.infer<typeof attachmentTargetTypeSchema>;

/** Loại file cho phép đính kèm: ảnh + PDF. */
export const ATTACHMENT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const attachmentResponseSchema = z.object({
  id: z.uuid(),
  targetType: attachmentTargetTypeSchema,
  targetId: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  size: z.number().int(),
  /** Signed URL để xem/tải (hết hạn). */
  url: z.string(),
  createdAt: z.string(),
});
export type AttachmentResponse = z.infer<typeof attachmentResponseSchema>;

export const listAttachmentsQuerySchema = z.object({
  targetType: attachmentTargetTypeSchema,
  targetId: z.uuid(),
});
export type ListAttachmentsQuery = z.infer<typeof listAttachmentsQuerySchema>;

/** Body multipart đi kèm file (field text). */
export const uploadAttachmentSchema = z.object({
  targetType: attachmentTargetTypeSchema,
  targetId: z.uuid(),
});
export type UploadAttachmentInput = z.infer<typeof uploadAttachmentSchema>;
