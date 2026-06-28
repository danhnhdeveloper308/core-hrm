'use client';

import {
  PERMISSIONS,
  type CreateTrainingSessionInput,
  type CursorPaginated,
  type EmployeeResponse,
  type TrainingCourseResponse,
  type TrainingEnrollmentResponse,
  type TrainingEnrollmentStatus,
  type TrainingSessionResponse,
  type TrainingSessionStatus,
} from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { CalendarDays, Pencil, Plus, Users } from 'lucide-react';
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
import { useAuthStore } from '@/stores/auth-store';

const SESSION_STATUS_META: Record<
  TrainingSessionStatus,
  { label: string; cls: string }
> = {
  OPEN: { label: 'Đang mở', cls: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  FULL: { label: 'Đã đầy', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  RUNNING: { label: 'Đang học', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  DONE: { label: 'Hoàn thành', cls: 'bg-muted text-muted-foreground' },
  CANCELLED: { label: 'Đã huỷ', cls: 'bg-muted text-muted-foreground' },
};

const ENROLL_STATUS_META: Record<TrainingEnrollmentStatus, string> = {
  REGISTERED: 'Chờ duyệt',
  CONFIRMED: 'Đã xác nhận',
  ATTENDED: 'Đã tham gia',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã huỷ',
  NO_SHOW: 'Vắng',
};

const fmtDate = (s: string | null): string =>
  s ? new Date(s).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const toLocalInput = (iso: string): string => {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

interface SessionDraft {
  id: string | null;
  courseId: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string;
  link: string;
  trainerEmployeeId: string;
  capacity: string;
  status: TrainingSessionStatus;
}

function emptyDraft(): SessionDraft {
  return {
    id: null,
    courseId: '',
    title: '',
    startAt: '',
    endAt: '',
    location: '',
    link: '',
    trainerEmployeeId: '',
    capacity: '',
    status: 'OPEN',
  };
}

function toDraft(s: TrainingSessionResponse): SessionDraft {
  return {
    id: s.id,
    courseId: s.courseId,
    title: s.title ?? '',
    startAt: toLocalInput(s.startAt),
    endAt: s.endAt ? toLocalInput(s.endAt) : '',
    location: s.location ?? '',
    link: s.link ?? '',
    trainerEmployeeId: s.trainerEmployeeId ?? '',
    capacity: s.capacity !== null ? String(s.capacity) : '',
    status: s.status,
  };
}

export function SessionsTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage =
    user?.permissions.includes(PERMISSIONS.TRAINING_MANAGE) ?? false;
  const canReadEmployees =
    user?.permissions.includes(PERMISSIONS.EMPLOYEE_READ) ?? false;

  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [manageFor, setManageFor] = useState<TrainingSessionResponse | null>(null);

  const { data: courses } = useQuery({
    queryKey: queryKeys.training.courses({ pick: 'sessions' }),
    queryFn: () =>
      api.get<CursorPaginated<TrainingCourseResponse>>(
        '/training/courses?limit=200&active=true',
      ),
  });
  const courseList = courses?.items ?? [];

  const { data: employees } = useQuery({
    queryKey: queryKeys.employees.list({ pick: 'trainer' }),
    queryFn: () =>
      api.get<CursorPaginated<EmployeeResponse>>('/employees?limit=200'),
    enabled: canReadEmployees && draft !== null,
  });
  const employeeList = employees?.items ?? [];

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: queryKeys.training.sessions({}),
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '100' });
        if (pageParam) params.set('cursor', pageParam);
        return api.get<CursorPaginated<TrainingSessionResponse>>(
          `/training/sessions?${params.toString()}`,
        );
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['training', 'sessions'] });
  };

  const saveMutation = useMutation({
    mutationFn: (d: SessionDraft) => {
      const body: CreateTrainingSessionInput = {
        courseId: d.courseId,
        title: d.title.trim() || undefined,
        startAt: new Date(d.startAt).toISOString(),
        endAt: d.endAt ? new Date(d.endAt).toISOString() : undefined,
        location: d.location.trim() || undefined,
        link: d.link.trim() || undefined,
        trainerEmployeeId: d.trainerEmployeeId || undefined,
        capacity: d.capacity ? Number(d.capacity) : undefined,
      };
      return d.id
        ? api.patch<TrainingSessionResponse>(`/training/sessions/${d.id}`, {
            ...body,
            status: d.status,
          })
        : api.post<TrainingSessionResponse>('/training/sessions', body);
    },
    onSuccess: () => {
      invalidate();
      setDraft(null);
      toast.success('Đã lưu lớp');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lưu lớp thất bại'),
  });

  const registerMutation = useMutation({
    mutationFn: (sessionId: string) =>
      api.post<TrainingEnrollmentResponse>(
        `/training/sessions/${sessionId}/register`,
      ),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ['training', 'enrollments'] });
      toast.success('Đã đăng ký');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Đăng ký thất bại'),
  });

  const valid = (d: SessionDraft | null): d is SessionDraft =>
    !!d && !!d.courseId && !!d.startAt;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Các lớp/đợt đang mở — nhân viên tự đăng ký.
        </p>
        <PermissionGate permission={PERMISSIONS.TRAINING_MANAGE}>
          <Button
            disabled={courseList.length === 0}
            onClick={() => setDraft(emptyDraft())}
          >
            <Plus className="size-4" /> Mở lớp
          </Button>
        </PermissionGate>
      </div>

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
              <CalendarDays className="size-8 opacity-40" />
              Chưa có lớp đào tạo nào.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Khoá / Lớp</TableHead>
                    <TableHead>Bắt đầu</TableHead>
                    <TableHead>Địa điểm</TableHead>
                    <TableHead className="text-right">Sĩ số</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.courseTitle ?? '—'}</div>
                        {s.title ? (
                          <div className="text-xs text-muted-foreground">
                            {s.title}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(s.startAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.location ?? (s.link ? 'Trực tuyến' : '—')}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.enrolledCount}
                        {s.capacity !== null ? `/${s.capacity}` : ''}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={SESSION_STATUS_META[s.status].cls}
                        >
                          {SESSION_STATUS_META[s.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {s.status === 'OPEN' ? (
                            <Button
                              size="sm"
                              onClick={() => registerMutation.mutate(s.id)}
                              disabled={registerMutation.isPending}
                            >
                              Đăng ký
                            </Button>
                          ) : null}
                          {canManage ? (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Học viên"
                                onClick={() => setManageFor(s)}
                              >
                                <Users className="size-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Sửa"
                                onClick={() => setDraft(toDraft(s))}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {hasNextPage ? (
                <div className="p-3 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                  >
                    {isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog mở/sửa lớp */}
      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Sửa lớp' : 'Mở lớp đào tạo'}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Khoá học</Label>
                <Select
                  value={draft.courseId}
                  onValueChange={(v) => setDraft({ ...draft, courseId: v })}
                  disabled={Boolean(draft.id)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— Chọn khoá —" />
                  </SelectTrigger>
                  <SelectContent>
                    {courseList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tên lớp (tuỳ chọn)</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Đợt 1 - NMTS, Lớp sáng…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Bắt đầu</Label>
                  <Input
                    type="datetime-local"
                    value={draft.startAt}
                    onChange={(e) =>
                      setDraft({ ...draft, startAt: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Kết thúc</Label>
                  <Input
                    type="datetime-local"
                    value={draft.endAt}
                    onChange={(e) => setDraft({ ...draft, endAt: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Địa điểm</Label>
                  <Input
                    value={draft.location}
                    onChange={(e) =>
                      setDraft({ ...draft, location: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Link (trực tuyến)</Label>
                  <Input
                    value={draft.link}
                    onChange={(e) => setDraft({ ...draft, link: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {canReadEmployees ? (
                  <div className="space-y-1">
                    <Label>Giảng viên</Label>
                    <Select
                      value={draft.trainerEmployeeId || 'none'}
                      onValueChange={(v) =>
                        setDraft({
                          ...draft,
                          trainerEmployeeId: v === 'none' ? '' : v,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Không —</SelectItem>
                        {employeeList.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label>Sĩ số tối đa</Label>
                  <Input
                    type="number"
                    min={1}
                    value={draft.capacity}
                    onChange={(e) =>
                      setDraft({ ...draft, capacity: e.target.value })
                    }
                  />
                </div>
              </div>
              {draft.id ? (
                <div className="space-y-1">
                  <Label>Trạng thái</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(v) =>
                      setDraft({ ...draft, status: v as TrainingSessionStatus })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SESSION_STATUS_META) as TrainingSessionStatus[]).map(
                        (st) => (
                          <SelectItem key={st} value={st}>
                            {SESSION_STATUS_META[st].label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Huỷ
            </Button>
            <Button
              disabled={!valid(draft) || saveMutation.isPending}
              onClick={() => valid(draft) && saveMutation.mutate(draft)}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {manageFor ? (
        <EnrolleesDialog
          session={manageFor}
          onClose={() => setManageFor(null)}
        />
      ) : null}
    </div>
  );
}

function EnrolleesDialog({
  session,
  onClose,
}: {
  session: TrainingSessionResponse;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.training.enrollments({ sessionId: session.id }),
    queryFn: () =>
      api.get<CursorPaginated<TrainingEnrollmentResponse>>(
        `/training/enrollments?sessionId=${session.id}&limit=200`,
      ),
  });
  const rows = data?.items ?? [];

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TrainingEnrollmentStatus }) =>
      api.patch<TrainingEnrollmentResponse>(`/training/enrollments/${id}`, {
        status,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'enrollments'] });
      void qc.invalidateQueries({ queryKey: ['training', 'sessions'] });
      toast.success('Đã cập nhật');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Cập nhật thất bại'),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Học viên — {session.courseTitle}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Chưa có ai đăng ký.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nhân viên</TableHead>
                  <TableHead className="w-44">Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      {e.employeeName ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={e.status}
                        onValueChange={(v) =>
                          statusMutation.mutate({
                            id: e.id,
                            status: v as TrainingEnrollmentStatus,
                          })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ENROLL_STATUS_META) as TrainingEnrollmentStatus[]).map(
                            (st) => (
                              <SelectItem key={st} value={st}>
                                {ENROLL_STATUS_META[st]}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
