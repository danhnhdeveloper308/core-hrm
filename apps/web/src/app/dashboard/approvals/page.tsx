'use client';

import {
  type ApprovalInstanceResponse,
  type ApprovalStepState,
  type DecideApprovalInput,
  type LeaveRequestResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  CircleDashed,
  Clock,
  Inbox,
  Loader2,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AttachmentList } from '@/components/attachments/attachment-list';
import { FadeIn } from '@/components/motion/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/stores/auth-store';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import {
  APPROVAL_STATUS_BADGE,
  APPROVAL_STATUS_LABELS,
  TARGET_TYPE_LABELS,
  fmtDate,
  fmtDateTime,
  fmtDays,
} from '../leave/shared';

export default function ApprovalsPage() {
  return (
    <FadeIn className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Duyệt đơn</h1>
        <p className="text-muted-foreground">
          Đơn đang chờ bạn duyệt và tiến trình các đơn của bạn
        </p>
      </div>

      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">Chờ tôi duyệt</TabsTrigger>
          <TabsTrigger value="history">Đã xử lý</TabsTrigger>
          <TabsTrigger value="mine">Đơn của tôi</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox">
          <InboxTab />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab />
        </TabsContent>
        <TabsContent value="mine">
          <MyRequestsTab />
        </TabsContent>
      </Tabs>
    </FadeIn>
  );
}

// ===== Tab: Chờ tôi duyệt =====

function InboxTab() {
  const [decideTarget, setDecideTarget] = useState<{
    instance: ApprovalInstanceResponse;
    decision: DecideApprovalInput['decision'];
  } | null>(null);

  const { data: inbox, isLoading } = useQuery({
    queryKey: queryKeys.approval.inbox,
    queryFn: () => api.get<ApprovalInstanceResponse[]>('/approvals/inbox'),
    refetchInterval: 30_000,
  });
  // Đơn LEAVE trong phạm vi quản lý — để hiển thị chi tiết (ngày/lý do)
  const { data: teamRequests } = useQuery({
    queryKey: queryKeys.leave.requests({ scope: 'team' }),
    queryFn: () => api.get<LeaveRequestResponse[]>('/leave/requests?scope=team'),
  });
  const leaveById = new Map(
    (teamRequests ?? []).map((r) => [r.id, r] as const),
  );

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }
  if ((inbox ?? []).length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border py-16 text-muted-foreground">
        <Inbox className="size-8" />
        <p>Không có đơn nào chờ bạn duyệt.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {(inbox ?? []).map((inst) => {
          const leave = inst.targetType === 'LEAVE' ? leaveById.get(inst.targetId) : undefined;
          return (
            <Card key={inst.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{inst.requesterName}</span>
                  <Badge variant="outline">
                    {TARGET_TYPE_LABELS[inst.targetType] ?? inst.targetType}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {leave ? (
                  <div className="rounded-md bg-muted/40 p-2 text-sm">
                    <div className="font-medium">{leave.leaveTypeName}</div>
                    <div className="text-muted-foreground">
                      {fmtDate(leave.startDate)}
                      {leave.endDate !== leave.startDate && ` → ${fmtDate(leave.endDate)}`}
                      {' · '}
                      {fmtDays(leave.totalDays)} ngày
                    </div>
                    <div className="text-muted-foreground">Lý do: {leave.reason}</div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Gửi lúc {fmtDateTime(inst.createdAt)}
                  </p>
                )}

                {inst.targetType === 'LEAVE' && (
                  <AttachmentList targetType="LEAVE_REQUEST" targetId={inst.targetId} />
                )}

                <ApprovalChain steps={inst.steps} currentStep={inst.currentStep} />

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => setDecideTarget({ instance: inst, decision: 'APPROVE' })}
                  >
                    <Check className="size-4" /> Duyệt
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive"
                    onClick={() => setDecideTarget({ instance: inst, decision: 'REJECT' })}
                  >
                    <X className="size-4" /> Từ chối
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DecideDialog
        target={decideTarget}
        onClose={() => setDecideTarget(null)}
      />
    </>
  );
}

function DecideDialog({
  target,
  onClose,
}: {
  target: { instance: ApprovalInstanceResponse; decision: DecideApprovalInput['decision'] } | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const userId = useAuthStore((s) => s.user?.id);

  const isApprover = target
    ? target.instance.steps
        .find((s) => s.order === target.instance.currentStep)
        ?.approverIds.includes(userId ?? '')
    : false;
  const isReject = target?.decision === 'REJECT';

  const mutation = useMutation({
    mutationFn: (input: DecideApprovalInput) =>
      api.post<ApprovalInstanceResponse>(
        `/approvals/${target?.instance.id}/decide`,
        input,
      ),
    onSuccess: () => {
      toast.success(isReject ? 'Đã từ chối đơn' : 'Đã duyệt đơn');
      void queryClient.invalidateQueries({ queryKey: queryKeys.approval.inbox });
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
      setNote('');
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Thao tác thất bại'),
  });

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isReject ? 'Từ chối đơn' : 'Duyệt đơn'}</DialogTitle>
          <DialogDescription>
            {target?.instance.requesterName}
            {!isApprover && (
              <span className="mt-1 flex items-center gap-1 text-amber-600">
                <ShieldCheck className="size-3.5" /> Bạn duyệt thay (override) bước này
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="decide-note">
            Ghi chú {isReject ? '(nên có lý do từ chối)' : '(tuỳ chọn)'}
          </Label>
          <Input
            id="decide-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú…"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant={isReject ? 'destructive' : 'default'}
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                decision: target?.decision ?? 'APPROVE',
                note: note.trim() || null,
              })
            }
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {isReject ? 'Xác nhận từ chối' : 'Xác nhận duyệt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Tab: Đã xử lý =====

function HistoryTab() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.approval.history,
    queryFn: () => api.get<ApprovalInstanceResponse[]>('/approvals/history'),
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if ((data ?? []).length === 0) {
    return (
      <div className="rounded-md border py-16 text-center text-muted-foreground">
        Bạn chưa xử lý đơn nào.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {(data ?? []).map((inst) => (
          <Card
            key={inst.id}
            className="cursor-pointer transition-colors hover:bg-accent/40"
            onClick={() => setDetailId(inst.id)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{inst.requesterName}</span>
                <Badge variant={APPROVAL_STATUS_BADGE[inst.status]}>
                  {APPROVAL_STATUS_LABELS[inst.status]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <Badge variant="outline" className="mb-2">
                {TARGET_TYPE_LABELS[inst.targetType] ?? inst.targetType}
              </Badge>
              <div>Gửi lúc {fmtDateTime(inst.createdAt)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <InstanceDetailDialog instanceId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

// ===== Tab: Đơn của tôi =====

function MyRequestsTab() {
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: requests, isLoading } = useQuery({
    queryKey: queryKeys.leave.requests({ scope: 'mine' }),
    queryFn: () => api.get<LeaveRequestResponse[]>('/leave/requests?scope=mine'),
  });

  const withInstance = (requests ?? []).filter((r) => r.approvalInstanceId);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (withInstance.length === 0) {
    return (
      <div className="rounded-md border py-16 text-center text-muted-foreground">
        Bạn chưa có đơn nào trong quy trình duyệt.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {withInstance.map((r) => (
          <Card
            key={r.id}
            className="cursor-pointer transition-colors hover:bg-accent/40"
            onClick={() => setDetailId(r.approvalInstanceId)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{r.leaveTypeName}</span>
                <Badge variant={APPROVAL_STATUS_BADGE[r.status]}>
                  {APPROVAL_STATUS_LABELS[r.status]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {fmtDate(r.startDate)}
              {r.endDate !== r.startDate && ` → ${fmtDate(r.endDate)}`}
              {' · '}
              {fmtDays(r.totalDays)} ngày
            </CardContent>
          </Card>
        ))}
      </div>

      <InstanceDetailDialog instanceId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

function InstanceDetailDialog({
  instanceId,
  onClose,
}: {
  instanceId: string | null;
  onClose: () => void;
}) {
  const { data: instance, isLoading } = useQuery({
    queryKey: queryKeys.approval.instance(instanceId ?? ''),
    queryFn: () => api.get<ApprovalInstanceResponse>(`/approvals/${instanceId}`),
    enabled: instanceId !== null,
  });

  return (
    <Dialog open={instanceId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tiến trình duyệt</DialogTitle>
        </DialogHeader>
        {isLoading || !instance ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Gửi lúc {fmtDateTime(instance.createdAt)}
              </span>
              <Badge variant={APPROVAL_STATUS_BADGE[instance.status]}>
                {APPROVAL_STATUS_LABELS[instance.status]}
              </Badge>
            </div>
            {instance.targetType === 'LEAVE' && (
              <AttachmentList targetType="LEAVE_REQUEST" targetId={instance.targetId} />
            )}
            <ApprovalChain steps={instance.steps} currentStep={instance.currentStep} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ===== Hiển thị chuỗi duyệt =====

function ApprovalChain({
  steps,
  currentStep,
}: {
  steps: ApprovalStepState[];
  currentStep: number;
}) {
  const visible = steps.filter((s) => !s.skipped);
  return (
    <ol className="space-y-2">
      {visible.map((step) => {
        const isCurrent = step.order === currentStep && step.decision === null;
        const Icon =
          step.decision === 'APPROVE'
            ? CheckCircle2
            : step.decision === 'REJECT'
              ? XCircle
              : isCurrent
                ? Clock
                : CircleDashed;
        const color =
          step.decision === 'APPROVE'
            ? 'text-emerald-600'
            : step.decision === 'REJECT'
              ? 'text-destructive'
              : isCurrent
                ? 'text-primary'
                : 'text-muted-foreground';
        return (
          <li key={step.order} className="flex items-start gap-2 text-sm">
            <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{step.label}</span>
                {isCurrent && (
                  <Badge variant="secondary" className="text-[10px]">
                    đang chờ
                  </Badge>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {step.approverNames.join(', ') || '—'}
              </div>
              {step.decidedByName && (
                <div className="text-xs text-muted-foreground">
                  {step.decision === 'APPROVE' ? 'Duyệt' : 'Từ chối'} bởi{' '}
                  {step.decidedByName}
                  {step.decidedAt && ` · ${fmtDateTime(step.decidedAt)}`}
                  {step.note && ` · “${step.note}”`}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
