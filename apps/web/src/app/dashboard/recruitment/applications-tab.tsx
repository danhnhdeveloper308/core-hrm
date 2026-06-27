'use client';

import {
  PERMISSIONS,
  type ApplicationResponse,
  type ApplicationStage,
  type CandidateResponse,
  type CursorPaginated,
  type JobRequisitionResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, Plus, UserSearch } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PermissionGate } from '@/components/permission-gate';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { cn } from '@/lib/utils';

const STAGES: { key: ApplicationStage; label: string; cls: string }[] = [
  { key: 'APPLIED', label: 'Ứng tuyển', cls: 'border-t-slate-400' },
  { key: 'SCREENING', label: 'Sàng lọc', cls: 'border-t-sky-400' },
  { key: 'INTERVIEW', label: 'Phỏng vấn', cls: 'border-t-violet-400' },
  { key: 'OFFER', label: 'Offer', cls: 'border-t-amber-400' },
  { key: 'HIRED', label: 'Nhận việc', cls: 'border-t-green-500' },
  { key: 'REJECTED', label: 'Loại', cls: 'border-t-red-400' },
];

interface NewCandidate {
  fullName: string;
  email: string;
  phone: string;
  source: string;
}

export function ApplicationsTab() {
  const qc = useQueryClient();
  const [reqId, setReqId] = useState<string>('');
  const [adding, setAdding] = useState(false);

  const { data: reqData } = useQuery({
    queryKey: queryKeys.recruitment.jobRequisitions({ all: true }),
    queryFn: () =>
      api.get<CursorPaginated<JobRequisitionResponse>>('/job-requisitions?limit=100'),
  });
  const requisitions = reqData?.items ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['recruitment', 'applications', reqId],
    queryFn: () =>
      api.get<CursorPaginated<ApplicationResponse>>(
        `/applications?jobRequisitionId=${reqId}&limit=200`,
      ),
    enabled: Boolean(reqId),
  });

  const byStage = useMemo(() => {
    const m = new Map<ApplicationStage, ApplicationResponse[]>();
    for (const s of STAGES) m.set(s.key, []);
    for (const a of data?.items ?? []) m.get(a.stage)?.push(a);
    return m;
  }, [data]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['recruitment', 'applications', reqId] });

  const moveMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: ApplicationStage }) =>
      api.patch<ApplicationResponse>(`/applications/${id}/stage`, { stage }),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Chuyển stage thất bại'),
  });

  if (requisitions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có tin tuyển dụng. Tạo tin ở tab “Tin tuyển dụng” trước khi thêm ứng viên.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={reqId} onValueChange={setReqId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="— Chọn tin tuyển dụng —" />
          </SelectTrigger>
          <SelectContent>
            {requisitions.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {reqId ? (
          <PermissionGate permission={PERMISSIONS.RECRUITMENT_MANAGE}>
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Thêm ứng viên
            </Button>
          </PermissionGate>
        ) : null}
      </div>

      {!reqId ? (
        <p className="text-sm text-muted-foreground">Chọn 1 tin để xem bảng ứng viên.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STAGES.map((s) => {
            const items = byStage.get(s.key) ?? [];
            return (
              <div key={s.key} className="w-72 shrink-0">
                <div className={cn('mb-2 flex items-center justify-between rounded-md border-t-2 bg-muted/40 px-3 py-2', s.cls)}>
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((a) => (
                    <Card key={a.id}>
                      <CardContent className="space-y-2 p-3">
                        <div className="font-medium">{a.candidateName}</div>
                        {a.candidateEmail ? (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="size-3" /> {a.candidateEmail}
                          </div>
                        ) : null}
                        {a.candidatePhone ? (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="size-3" /> {a.candidatePhone}
                          </div>
                        ) : null}
                        <PermissionGate permission={PERMISSIONS.RECRUITMENT_MANAGE}>
                          <Select
                            value={a.stage}
                            onValueChange={(v) =>
                              moveMutation.mutate({ id: a.id, stage: v as ApplicationStage })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map((st) => (
                                <SelectItem key={st.key} value={st.key}>
                                  Chuyển: {st.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </PermissionGate>
                      </CardContent>
                    </Card>
                  ))}
                  {items.length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">—</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddApplicationDialog
        open={adding}
        reqId={reqId}
        onClose={() => setAdding(false)}
        onDone={() => {
          void invalidate();
          setAdding(false);
        }}
      />
    </div>
  );
}

function AddApplicationDialog({
  open,
  reqId,
  onClose,
  onDone,
}: {
  open: boolean;
  reqId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [nc, setNc] = useState<NewCandidate>({ fullName: '', email: '', phone: '', source: '' });
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<CandidateResponse | null>(null);

  const { data: candidates = [] } = useQuery({
    queryKey: ['recruitment', 'candidates', search],
    queryFn: () =>
      api.get<CandidateResponse[]>(
        `/candidates${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`,
      ),
    enabled: open && mode === 'existing',
  });

  const mutation = useMutation({
    mutationFn: () => {
      const body =
        mode === 'existing'
          ? { jobRequisitionId: reqId, candidateId: picked!.id }
          : {
              jobRequisitionId: reqId,
              candidate: {
                fullName: nc.fullName.trim(),
                email: nc.email.trim() || null,
                phone: nc.phone.trim() || null,
                source: nc.source.trim() || null,
              },
            };
      return api.post<ApplicationResponse>('/applications', body);
    },
    onSuccess: () => {
      toast.success('Đã thêm ứng viên');
      setNc({ fullName: '', email: '', phone: '', source: '' });
      setPicked(null);
      setSearch('');
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Thêm thất bại'),
  });

  const disabled =
    mutation.isPending ||
    (mode === 'new' ? !nc.fullName.trim() : !picked);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm ứng viên vào tin</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={mode === 'new' ? 'default' : 'outline'} onClick={() => setMode('new')}>
              Ứng viên mới
            </Button>
            <Button size="sm" variant={mode === 'existing' ? 'default' : 'outline'} onClick={() => setMode('existing')}>
              Có sẵn
            </Button>
          </div>

          {mode === 'new' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Họ tên</Label>
                <Input value={nc.fullName} onChange={(e) => setNc({ ...nc, fullName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Điện thoại</Label>
                <Input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Nguồn</Label>
                <Input value={nc.source} onChange={(e) => setNc({ ...nc, source: e.target.value })} placeholder="LinkedIn, giới thiệu…" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-md border px-2">
                <UserSearch className="size-4 text-muted-foreground" />
                <Input
                  className="border-0 px-0 shadow-none focus-visible:ring-0"
                  placeholder="Tìm ứng viên có sẵn…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPicked(c)}
                    className={cn(
                      'flex w-full flex-col rounded-md border px-3 py-2 text-left text-sm hover:bg-accent/50',
                      picked?.id === c.id && 'border-primary bg-accent/50',
                    )}
                  >
                    <span className="font-medium">{c.fullName}</span>
                    <span className="text-xs text-muted-foreground">
                      {[c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </button>
                ))}
                {candidates.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">Không có ứng viên khớp.</p>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button disabled={disabled} onClick={() => mutation.mutate()}>
            Thêm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
