'use client';

import type { AttachmentResponse, AttachmentTargetType } from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { FileText, ImageIcon, Paperclip } from 'lucide-react';
import { api } from '@/lib/api/client';

/** Hiển thị file đính kèm của 1 đơn (signed URL) — cho người duyệt xem. */
export function AttachmentList({
  targetType,
  targetId,
}: {
  targetType: AttachmentTargetType;
  targetId: string;
}) {
  const { data } = useQuery({
    queryKey: ['attachments', targetType, targetId],
    queryFn: () => {
      const qs = new URLSearchParams({ targetType, targetId });
      return api.get<AttachmentResponse[]>(`/attachments?${qs.toString()}`);
    },
  });

  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Paperclip className="size-3.5" /> Giấy tờ đính kèm ({data.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {data.map((att) => (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
          >
            {att.contentType === 'application/pdf' ? (
              <FileText className="size-3.5" />
            ) : (
              <ImageIcon className="size-3.5" />
            )}
            <span className="max-w-40 truncate">{att.fileName}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
