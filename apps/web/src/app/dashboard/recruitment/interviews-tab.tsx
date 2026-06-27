'use client';

import {
  PERMISSIONS,
  type ApplicationResponse,
  type CursorPaginated,
  type EmployeeResponse,
  type InterviewFeedbackResponse,
  type InterviewMode,
  type InterviewRecommendation,
  type InterviewResponse,
  type InterviewStatus,
  type JobRequisitionResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, MessageSquare, Plus, Video } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PermissionGate } from '@/components/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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

const MODE_LABEL: Record<InterviewMode, string> = {
  ONSITE: 'Trực tiếp',
  ONLINE: 'Online',
  PHONE: 'Điện thoại',
};
const STATUS_LABEL: Record<InterviewStatus, string> = {
  SCHEDULED: 'Đã lên lịch',
  DONE: 'Hoàn tất',
  CANCELLED: 'Đã huỷ',
  NO_SHOW: 'Vắng mặt',
};
const REC_LABEL: Record<InterviewRecommendation, string> = {
  HIRE: 'Nên tuyển',
  NO_HIRE: 'Không tuyển',
  MAYBE: 'Cân nhắc',
};
const ALL_STATUS = Object.keys(STATUS_LABEL) as InterviewStatus[];
const ALL_MODE = Object.keys(MODE_LABEL) as InterviewMode[];

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function InterviewsTab() {
  const qc = useQueryClient();
  const [scheduling, setScheduling] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<InterviewResponse | null>(null);

  const { data } = useQuery({
    queryKey: queryKeys.recruitment.interviews({ all: true }),
    queryFn: () =>
      api.get<CursorPaginated<InterviewResponse>>('/interviews?limit=100'),
  });
  const interviews = data?.items ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['recruitment', 'interviews'] });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: InterviewStatus }) =>
      api.patch<InterviewResponse>(`/interviews/${id}`, { status }),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Đổi trạng thái thất bại'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <PermissionGate permission={PERMISSIONS.RECRUITMENT_MANAGE}>
          <Button onClick={() => setScheduling(true)}>
            <Plus className="size-4" /> Lên lịch phỏng vấn
          </Button>
        </PermissionGate>
      </div>

      {interviews.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
          <CalendarClock className="size-8 opacity-40" />
          Chưa có buổi phỏng vấn nào.
        </div>
      ) : (
        <div className="space-y-2">
          {interviews.map((i) => (
            <Card key={i.id}>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-48 flex-1">
                  <div className="font-medium">{i.candidateName}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.jobTitle ?? '—'} · Vòng {i.round} · {MODE_LABEL[i.mode]}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <CalendarClock className="size-4" /> {fmt(i.scheduledAt)} ({i.durationMin}′)
                </div>
                {i.meetingLink ? (
                  <a
                    href={i.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Video className="size-4" /> Link
                  </a>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  {i.panelists.map((p) => p.employeeName).join(', ') || 'Chưa có hội đồng'}
                </div>
                <Badge variant="secondary">{STATUS_LABEL[i.status]}</Badge>
                <PermissionGate permission={PERMISSIONS.RECRUITMENT_MANAGE}>
                  <div className="flex items-center gap-2">
                    <Select
                      value={i.status}
                      onValueChange={(v) => statusMutation.mutate({ id: i.id, status: v as InterviewStatus })}
                    >
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_STATUS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => setFeedbackFor(i)}>
                      <MessageSquare className="size-4" /> Đánh giá ({i.feedbackCount})
                    </Button>
                  </div>
                </PermissionGate>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ScheduleDialog open={scheduling} onClose={() => setScheduling(false)} onDone={() => { void invalidate(); setScheduling(false); }} />
      <FeedbackDialog interview={feedbackFor} onClose={() => setFeedbackFor(null)} onDone={() => void invalidate()} />
    </div>
  );
}

function ScheduleDialog({
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
  const [round, setRound] = useState('1');
  const [mode, setMode] = useState<InterviewMode>('ONSITE');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMin, setDurationMin] = useState('60');
  const [location, setLocation] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [panelists, setPanelists] = useState<string[]>([]);

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
  const { data: empData } = useQuery({
    queryKey: ['employees', 'picker'],
    queryFn: () => api.get<CursorPaginated<EmployeeResponse>>('/employees?limit=100'),
    enabled: open,
  });
  const employees = empData?.items ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      api.post<InterviewResponse>('/interviews', {
        applicationId,
        round: Number(round),
        mode,
        scheduledAt,
        durationMin: Number(durationMin),
        location: location.trim() || null,
        meetingLink: meetingLink.trim() || null,
        panelistEmployeeIds: panelists,
      }),
    onSuccess: () => {
      toast.success('Đã lên lịch phỏng vấn');
      setReqId('');
      setApplicationId('');
      setScheduledAt('');
      setPanelists([]);
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Lên lịch thất bại'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lên lịch phỏng vấn</DialogTitle>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Vòng</Label>
              <Input type="number" min={1} value={round} onChange={(e) => setRound(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Hình thức</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as InterviewMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_MODE.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MODE_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Thời gian</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Thời lượng (phút)</Label>
              <Input type="number" min={5} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
            </div>
          </div>
          {mode === 'ONLINE' ? (
            <div className="space-y-1">
              <Label>Link họp</Label>
              <Input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://meet…" />
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Địa điểm</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Hội đồng phỏng vấn</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {employees.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={panelists.includes(e.id)}
                    onCheckedChange={(c) =>
                      setPanelists((prev) => (c ? [...prev, e.id] : prev.filter((x) => x !== e.id)))
                    }
                  />
                  {e.fullName} · {e.code}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button disabled={!applicationId || !scheduledAt || mutation.isPending} onClick={() => mutation.mutate()}>
            Lên lịch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackDialog({
  interview,
  onClose,
  onDone,
}: {
  interview: InterviewResponse | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [score, setScore] = useState('');
  const [recommendation, setRecommendation] = useState<InterviewRecommendation>('MAYBE');
  const [comment, setComment] = useState('');

  const { data: feedbacks = [] } = useQuery({
    queryKey: ['recruitment', 'feedback', interview?.id],
    queryFn: () => api.get<InterviewFeedbackResponse[]>(`/interviews/${interview!.id}/feedback`),
    enabled: Boolean(interview),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post<InterviewFeedbackResponse>(`/interviews/${interview!.id}/feedback`, {
        score: score ? Number(score) : null,
        recommendation,
        comment: comment.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Đã gửi đánh giá');
      setComment('');
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Gửi đánh giá thất bại'),
  });

  return (
    <Dialog open={interview !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đánh giá phỏng vấn — {interview?.candidateName}</DialogTitle>
        </DialogHeader>
        {feedbacks.length > 0 ? (
          <div className="space-y-2">
            {feedbacks.map((f) => (
              <div key={f.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{f.interviewerName ?? 'Ẩn'}</span>
                  <span className="text-xs text-muted-foreground">
                    {REC_LABEL[f.recommendation]}
                    {f.score ? ` · ${f.score}/5` : ''}
                  </span>
                </div>
                {f.comment ? <p className="mt-1 text-muted-foreground">{f.comment}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-medium">Đánh giá của bạn</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Điểm (1–5)</Label>
              <Input type="number" min={1} max={5} value={score} onChange={(e) => setScore(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Đề xuất</Label>
              <Select value={recommendation} onValueChange={(v) => setRecommendation(v as InterviewRecommendation)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(REC_LABEL) as InterviewRecommendation[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {REC_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Nhận xét</Label>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Gửi đánh giá
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
