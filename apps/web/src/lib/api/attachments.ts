import type { AttachmentResponse, AttachmentTargetType } from '@repo/shared';
import { api } from './client';

/** Upload nhiều file đính kèm cho 1 đơn (sau khi đơn đã được tạo). */
export function uploadAttachments(
  targetType: AttachmentTargetType,
  targetId: string,
  files: File[],
): Promise<AttachmentResponse[]> {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  const qs = new URLSearchParams({ targetType, targetId });
  return api.upload<AttachmentResponse[]>(`/attachments?${qs.toString()}`, fd);
}
