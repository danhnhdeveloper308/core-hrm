'use client';

import {
  SHIFT_VARIANT_LABELS,
  type ApprovalInstanceResponse,
  type ShiftRegistrationBatchResponse,
  type UploadBatchResult,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FadeIn } from '@/components/motion/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import {
  APPROVAL_STATUS_BADGE,
  APPROVAL_STATUS_LABELS,
  fmtDate,
  fmtDateTime,
} from '../leave/shared';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export default function ShiftRegistrationsPage() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: batches, isLoading } = useQuery({
    queryKey: queryKeys.shiftRegistrations.all,
    queryFn: () => api.get<ShiftRegistrationBatchResponse[]>('/shift-registrations'),
  });

  async function downloadTemplate() {
    try {
      const res = await fetch(`${BASE_URL}/shift-registrations/template`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Tải mẫu thất bại');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mau-dang-ky-tang-gian-ca.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Không tải được file mẫu');
    }
  }

  return (
    <FadeIn className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Phiếu tăng/giãn ca</h1>
          <p className="text-muted-foreground">
            Đăng ký theo danh sách qua Excel → duyệt nhiều cấp → tự áp công
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="size-4" /> Tải mẫu Excel
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" /> Upload danh sách
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tiêu đề</TableHead>
              <TableHead>Số NV</TableHead>
              <TableHead>Người tổng hợp</TableHead>
              <TableHead>Gửi lúc</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : (batches ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Chưa có phiếu nào. Tải mẫu, điền danh sách rồi upload.
                </TableCell>
              </TableRow>
            ) : (
              (batches ?? []).map((b) => (
                <TableRow
                  key={b.id}
                  className="cursor-pointer"
                  onClick={() => setDetailId(b.id)}
                >
                  <TableCell className="font-medium">{b.title}</TableCell>
                  <TableCell>{b.lineCount}</TableCell>
                  <TableCell>{b.uploadedByName ?? '—'}</TableCell>
                  <TableCell>{fmtDateTime(b.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={APPROVAL_STATUS_BADGE[b.status]}>
                      {APPROVAL_STATUS_LABELS[b.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <BatchDetailDialog batchId={detailId} onClose={() => setDetailId(null)} />
    </FadeIn>
  );
}

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadBatchResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('file', file!);
      return api.upload<UploadBatchResult>('/shift-registrations/upload', fd);
    },
    onSuccess: (res) => {
      setResult(res);
      toast.success(`Đã tạo phiếu — ${res.created} dòng`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.shiftRegistrations.all });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Upload thất bại'),
  });

  function close() {
    setTitle('');
    setFile(null);
    setResult(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5" /> Upload danh sách tăng/giãn ca
          </DialogTitle>
          <DialogDescription>
            File Excel theo mẫu: mỗi dòng = MSNV + ngày + loại ca + lý do.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3">
            <p className="text-sm">
              Đã tạo phiếu với <b>{result.created}</b> dòng hợp lệ.
            </p>
            {result.errors.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm">
                <p className="font-medium text-amber-700">
                  {result.errors.length} dòng bị bỏ qua:
                </p>
                <ul className="mt-1 list-disc pl-5 text-amber-700">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      Dòng {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button onClick={close}>Xong</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="sr-title">Tiêu đề phiếu</Label>
              <Input
                id="sr-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Tuần 25 - NMTS 1"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sr-file">File Excel (.xlsx)</Label>
              <Input
                id="sr-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Huỷ
              </Button>
              <Button
                disabled={!file || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Upload
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BatchDetailDialog({
  batchId,
  onClose,
}: {
  batchId: string | null;
  onClose: () => void;
}) {
  const { data: batch } = useQuery({
    queryKey: queryKeys.shiftRegistrations.detail(batchId ?? ''),
    queryFn: () => api.get<ShiftRegistrationBatchResponse>(`/shift-registrations/${batchId}`),
    enabled: batchId !== null,
  });
  const { data: instance } = useQuery({
    queryKey: queryKeys.approval.instance(batch?.approvalInstanceId ?? ''),
    queryFn: () =>
      api.get<ApprovalInstanceResponse>(`/approvals/${batch?.approvalInstanceId}`),
    enabled: !!batch?.approvalInstanceId,
  });

  return (
    <Dialog open={batchId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{batch?.title ?? 'Phiếu tăng/giãn ca'}</DialogTitle>
        </DialogHeader>
        {!batch ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-4">
            {instance && (
              <SignatureRow instance={instance} tongHop={batch.uploadedByName} />
            )}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>MSNV</TableHead>
                    <TableHead>Họ tên</TableHead>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Lý do</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(batch.lines ?? []).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.employeeCode}</TableCell>
                      <TableCell>{l.employeeName}</TableCell>
                      <TableCell>{fmtDate(l.date)}</TableCell>
                      <TableCell>{SHIFT_VARIANT_LABELS[l.variant]}</TableCell>
                      <TableCell className="text-muted-foreground">{l.reason ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Hàng chữ ký: cấp cao nhất (bước cuối) sát trái … người tổng hợp sát phải. */
function SignatureRow({
  instance,
  tongHop,
}: {
  instance: ApprovalInstanceResponse;
  tongHop: string | null;
}) {
  const steps = instance.steps.filter((s) => !s.skipped);
  // Đảo thứ tự: cấp cao nhất (order lớn nhất) nằm trái nhất
  const ordered = [...steps].reverse();
  return (
    <div className="flex flex-wrap gap-4 rounded-md border bg-muted/30 p-3">
      {ordered.map((s) => (
        <div key={s.order} className="min-w-32 flex-1 text-center">
          <div className="text-xs font-semibold uppercase">{s.label}</div>
          <div className="mt-6 border-t pt-1 text-sm">
            {s.decision === 'APPROVE' ? (
              <span className="text-emerald-600">✓ {s.decidedByName}</span>
            ) : s.decision === 'REJECT' ? (
              <span className="text-destructive">✗ {s.decidedByName}</span>
            ) : (
              <span className="text-muted-foreground">
                {s.approverNames.join(', ') || '—'}
              </span>
            )}
          </div>
        </div>
      ))}
      <div className="min-w-32 flex-1 text-center">
        <div className="text-xs font-semibold uppercase">Tổng hợp</div>
        <div className="mt-6 border-t pt-1 text-sm">{tongHop ?? '—'}</div>
      </div>
    </div>
  );
}
