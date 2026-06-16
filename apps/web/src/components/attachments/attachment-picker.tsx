'use client';

import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_SIZE } from '@repo/shared';
import { FileText, ImageIcon, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/**
 * Chọn file đính kèm (ảnh/PDF) trước khi đơn được tạo — giữ File[] ở state cha,
 * upload sau khi có targetId.
 */
export function AttachmentPicker({
  files,
  onChange,
  label = 'Đính kèm giấy tờ (ảnh/PDF, không bắt buộc)',
}: {
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
}) {
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!ATTACHMENT_ACCEPT.includes(f.type)) {
        toast.error(`${f.name}: chỉ nhận ảnh hoặc PDF`);
        continue;
      }
      if (f.size > ATTACHMENT_MAX_SIZE) {
        toast.error(`${f.name}: vượt quá 10MB`);
        continue;
      }
      if (next.length >= 5) {
        toast.error('Tối đa 5 file');
        break;
      }
      next.push(f);
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => (
          <span
            key={`${f.name}-${i}`}
            className="flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs"
          >
            {f.type === 'application/pdf' ? (
              <FileText className="size-3.5" />
            ) : (
              <ImageIcon className="size-3.5" />
            )}
            <span className="max-w-32 truncate">{f.name}</span>
            <button
              type="button"
              onClick={() => onChange(files.filter((_, idx) => idx !== i))}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" asChild>
        <label className="cursor-pointer">
          <Paperclip className="size-3.5" /> Chọn file
          <input
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT.join(',')}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </Button>
    </div>
  );
}
