'use client';

import {
  PERMISSIONS,
  type ApplicationResponse,
  type CursorPaginated,
  type JobRequisitionResponse,
  type OfferResponse,
  type OfferStatus,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PermissionGate } from '@/components/permission-gate';
import { Badge } from '@/components/ui/badge';
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

const STATUS_META: Record<OfferStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Nháp', cls: 'bg-muted text-muted-foreground' },
  PENDING_APPROVAL: { label: 'Chờ duyệt', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  SENT: { label: 'Đã gửi', cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  ACCEPTED: { label: 'Đã nhận', cls: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  DECLINED: { label: 'Từ chối', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  EXPIRED: { label: 'Hết hạn', cls: 'bg-muted text-muted-foreground' },
};

function money(v: number): string {
  return new Intl.NumberFormat('vi-VN').format(v) + '₫';
}

export function OffersTab() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [accepting, setAccepting] = useState<OfferResponse | null>(null);

  const { data } = useQuery({
    queryKey: queryKeys.recruitment.offers({ all: true }),
    queryFn: () => api.get<CursorPaginated<OfferResponse>>('/offers?limit=100'),
  });
  const offers = data?.items ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['recruitment', 'offers'] });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'submit' | 'decline' }) =>
      api.post<OfferResponse>(`/offers/${id}/${action}`),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Thao tác thất bại'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <PermissionGate permission={PERMISSIONS.OFFER_MANAGE}>
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Tạo offer
          </Button>
        </PermissionGate>
      </div>

      <Card>
        <CardContent className="px-0">
          {offers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
              <Send className="size-8 opacity-40" />
              Chưa có offer nào.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ứng viên</TableHead>
                    <TableHead>Vị trí</TableHead>
                    <TableHead className="text-right">Lương</TableHead>
                    <TableHead>Bắt đầu</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <PermissionGate permission={PERMISSIONS.OFFER_MANAGE}>
                      <TableHead className="w-56" />
                    </PermissionGate>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offers.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <div className="font-medium">{o.candidateName}</div>
                        <div className="text-xs text-muted-foreground">{o.jobTitle ?? '—'}</div>
                      </TableCell>
                      <TableCell className="text-sm">{o.position ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(o.baseSalary)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{o.startDate ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_META[o.status].cls}>
                          {STATUS_META[o.status].label}
                        </Badge>
                      </TableCell>
                      <PermissionGate permission={PERMISSIONS.OFFER_MANAGE}>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1">
                            {o.status === 'DRAFT' ? (
                              <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: o.id, action: 'submit' })}>
                                Gửi duyệt
                              </Button>
                            ) : null}
                            {o.status === 'SENT' ? (
                              <Button size="sm" onClick={() => setAccepting(o)}>
                                Chấp nhận
                              </Button>
                            ) : null}
                            {o.status === 'DRAFT' ||
                            o.status === 'PENDING_APPROVAL' ||
                            o.status === 'SENT' ? (
                              <Button size="sm" variant="ghost" onClick={() => actionMutation.mutate({ id: o.id, action: 'decline' })}>
                                Từ chối
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </PermissionGate>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateOfferDialog open={creating} onClose={() => setCreating(false)} onDone={() => { void invalidate(); setCreating(false); }} />
      <AcceptOfferDialog offer={accepting} onClose={() => setAccepting(null)} onDone={() => { void invalidate(); setAccepting(null); }} />
    </div>
  );
}

function CreateOfferDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reqId, setReqId] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [position, setPosition] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [startDate, setStartDate] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const { data: reqData } = useQuery({
    queryKey: queryKeys.recruitment.jobRequisitions({ all: true }),
    queryFn: () => api.get<CursorPaginated<JobRequisitionResponse>>('/job-requisitions?limit=100'),
    enabled: open,
  });
  const { data: appData } = useQuery({
    queryKey: ['recruitment', 'applications', reqId],
    queryFn: () => api.get<CursorPaginated<ApplicationResponse>>(`/applications?jobRequisitionId=${reqId}&limit=200`),
    enabled: open && Boolean(reqId),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post<OfferResponse>('/offers', {
        applicationId,
        position: position.trim() || null,
        baseSalary: Number(baseSalary),
        startDate: startDate || null,
        expiresAt: expiresAt || null,
      }),
    onSuccess: () => {
      toast.success('Đã tạo offer (nháp)');
      setReqId('');
      setApplicationId('');
      setPosition('');
      setBaseSalary('');
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Tạo offer thất bại'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo offer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Tin tuyển dụng</Label>
            <Select value={reqId} onValueChange={(v) => { setReqId(v); setApplicationId(''); }}>
              <SelectTrigger>
                <SelectValue placeholder="— Chọn tin —" />
              </SelectTrigger>
              <SelectContent>
                {(reqData?.items ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {reqId ? (
            <div className="space-y-1">
              <Label>Ứng viên</Label>
              <Select value={applicationId} onValueChange={setApplicationId}>
                <SelectTrigger>
                  <SelectValue placeholder="— Chọn ứng viên —" />
                </SelectTrigger>
                <SelectContent>
                  {(appData?.items ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.candidateName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>Vị trí</Label>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Nhân viên kinh doanh" />
          </div>
          <div className="space-y-1">
            <Label>Lương cơ bản (VND)</Label>
            <Input type="number" min={0} value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Ngày bắt đầu</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Hết hạn offer</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button disabled={!applicationId || !baseSalary || mutation.isPending} onClick={() => mutation.mutate()}>
            Tạo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcceptOfferDialog({
  offer,
  onClose,
  onDone,
}: {
  offer: OfferResponse | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [employeeCode, setEmployeeCode] = useState('');
  const [joinDate, setJoinDate] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post<OfferResponse & { employeeId: string }>(`/offers/${offer!.id}/accept`, {
        employeeCode: employeeCode.trim(),
        joinDate: joinDate || undefined,
      }),
    onSuccess: () => {
      toast.success('Đã chấp nhận offer & tạo hồ sơ nhân viên');
      setEmployeeCode('');
      setJoinDate('');
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Chấp nhận thất bại'),
  });

  return (
    <Dialog open={offer !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chấp nhận offer → tạo nhân viên</DialogTitle>
        </DialogHeader>
        {offer ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {offer.candidateName}
              {offer.candidatePhone ? ` · ${offer.candidatePhone}` : ' · (thiếu SĐT)'}
            </p>
            <div className="space-y-1">
              <Label>Mã nhân viên</Label>
              <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="NV-001" />
            </div>
            <div className="space-y-1">
              <Label>Ngày vào làm (trống = theo offer)</Label>
              <Input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Hệ thống sẽ tạo hồ sơ nhân viên (kèm tài khoản đăng nhập) từ thông tin ứng viên.
            </p>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button disabled={!employeeCode.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            Chấp nhận & tạo NV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
