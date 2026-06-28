'use client';

import {
  type CursorPaginated,
  type TrainingEnrollmentResponse,
  type TrainingEnrollmentStatus,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

const STATUS_META: Record<TrainingEnrollmentStatus, { label: string; cls: string }> = {
  REGISTERED: { label: 'Chờ duyệt', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  CONFIRMED: { label: 'Đã xác nhận', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  ATTENDED: { label: 'Đã tham gia', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  COMPLETED: { label: 'Hoàn thành', cls: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  CANCELLED: { label: 'Đã huỷ', cls: 'bg-muted text-muted-foreground' },
  NO_SHOW: { label: 'Vắng', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
};

const fmtDate = (s: string | null): string =>
  s ? new Date(s).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export function MyEnrollmentsTab() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.training.myEnrollments,
    queryFn: () =>
      api.get<CursorPaginated<TrainingEnrollmentResponse>>(
        '/training/enrollments?mine=true&limit=200',
      ),
  });
  const rows = data?.items ?? [];

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<TrainingEnrollmentResponse>(`/training/enrollments/${id}/cancel`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'enrollments'] });
      void qc.invalidateQueries({ queryKey: ['training', 'sessions'] });
      toast.success('Đã huỷ đăng ký');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Huỷ thất bại'),
  });

  return (
    <Card>
      <CardContent className="px-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
            <GraduationCap className="size-8 opacity-40" />
            Bạn chưa đăng ký khoá đào tạo nào.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khoá / Lớp</TableHead>
                  <TableHead>Bắt đầu</TableHead>
                  <TableHead className="text-right">Điểm</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="font-medium">{e.courseTitle ?? '—'}</div>
                      {e.sessionTitle ? (
                        <div className="text-xs text-muted-foreground">
                          {e.sessionTitle}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(e.startAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.score !== null ? e.score : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={STATUS_META[e.status].cls}
                      >
                        {STATUS_META[e.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {e.status === 'REGISTERED' || e.status === 'CONFIRMED' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancelMutation.mutate(e.id)}
                        >
                          Huỷ
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
