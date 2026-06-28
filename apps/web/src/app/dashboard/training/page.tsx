'use client';

import {
  PERMISSIONS,
  type CreateTrainingCourseInput,
  type CursorPaginated,
  type TrainingCourseResponse,
  type TrainingMode,
} from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { CertificationsTab } from './certifications-tab';
import { MyEnrollmentsTab } from './my-enrollments-tab';
import { SessionsTab } from './sessions-tab';

const MODE_LABEL: Record<TrainingMode, string> = {
  ONLINE: 'Trực tuyến',
  OFFLINE: 'Tập trung',
  EXTERNAL: 'Thuê ngoài',
};

function money(v: number | null): string {
  return v === null ? '—' : new Intl.NumberFormat('vi-VN').format(v) + '₫';
}

interface CourseDraft {
  id: string | null;
  title: string;
  category: string;
  mode: TrainingMode;
  provider: string;
  durationHours: string;
  cost: string;
  description: string;
}

function emptyDraft(): CourseDraft {
  return {
    id: null,
    title: '',
    category: '',
    mode: 'OFFLINE',
    provider: '',
    durationHours: '',
    cost: '',
    description: '',
  };
}

function toDraft(c: TrainingCourseResponse): CourseDraft {
  return {
    id: c.id,
    title: c.title,
    category: c.category ?? '',
    mode: c.mode,
    provider: c.provider ?? '',
    durationHours: c.durationHours !== null ? String(c.durationHours) : '',
    cost: c.cost !== null ? String(c.cost) : '',
    description: c.description ?? '',
  };
}

function CoursesTab() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CourseDraft | null>(null);

  const filters = {};
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: queryKeys.training.courses(filters),
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '100' });
        if (pageParam) params.set('cursor', pageParam);
        return api.get<CursorPaginated<TrainingCourseResponse>>(
          `/training/courses?${params.toString()}`,
        );
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['training', 'courses'] });

  const saveMutation = useMutation({
    mutationFn: (d: CourseDraft) => {
      const body: CreateTrainingCourseInput = {
        title: d.title.trim(),
        category: d.category.trim() || undefined,
        mode: d.mode,
        provider: d.provider.trim() || undefined,
        durationHours: d.durationHours ? Number(d.durationHours) : undefined,
        cost: d.cost ? Number(d.cost) : undefined,
        description: d.description.trim() || undefined,
      };
      return d.id
        ? api.patch<TrainingCourseResponse>(`/training/courses/${d.id}`, body)
        : api.post<TrainingCourseResponse>('/training/courses', body);
    },
    onSuccess: () => {
      void invalidate();
      setDraft(null);
      toast.success('Đã lưu khoá đào tạo');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lưu khoá thất bại'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/training/courses/${id}`),
    onSuccess: () => {
      void invalidate();
      toast.success('Đã xoá khoá');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Xoá thất bại'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Thư viện khoá học để mở lớp/đợt đào tạo.
        </p>
        <PermissionGate permission={PERMISSIONS.TRAINING_MANAGE}>
          <Button onClick={() => setDraft(emptyDraft())}>
            <Plus className="size-4" /> Thêm khoá
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
              <BookOpen className="size-8 opacity-40" />
              Chưa có khoá đào tạo nào.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên khoá</TableHead>
                    <TableHead>Nhóm</TableHead>
                    <TableHead>Hình thức</TableHead>
                    <TableHead>Đơn vị đào tạo</TableHead>
                    <TableHead className="text-right">Thời lượng</TableHead>
                    <TableHead className="text-right">Chi phí</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <PermissionGate permission={PERMISSIONS.TRAINING_MANAGE}>
                      <TableHead className="w-20" />
                    </PermissionGate>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.category ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {MODE_LABEL[c.mode]}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.provider ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.durationHours !== null ? `${c.durationHours}h` : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(c.cost)}
                      </TableCell>
                      <TableCell>
                        {c.active ? (
                          <Badge
                            variant="secondary"
                            className="bg-green-500/15 text-green-600 dark:text-green-400"
                          >
                            Đang mở
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-muted text-muted-foreground">
                            Ẩn
                          </Badge>
                        )}
                      </TableCell>
                      <PermissionGate permission={PERMISSIONS.TRAINING_MANAGE}>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Sửa"
                              onClick={() => setDraft(toDraft(c))}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Xoá"
                              onClick={() => removeMutation.mutate(c.id)}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </PermissionGate>
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

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Sửa khoá' : 'Thêm khoá đào tạo'}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Tên khoá</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="An toàn lao động, Kỹ năng quản lý…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Nhóm</Label>
                  <Input
                    value={draft.category}
                    onChange={(e) =>
                      setDraft({ ...draft, category: e.target.value })
                    }
                    placeholder="Bắt buộc, Kỹ năng mềm…"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Hình thức</Label>
                  <Select
                    value={draft.mode}
                    onValueChange={(v) =>
                      setDraft({ ...draft, mode: v as TrainingMode })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MODE_LABEL) as TrainingMode[]).map((m) => (
                        <SelectItem key={m} value={m}>
                          {MODE_LABEL[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Đơn vị ĐT</Label>
                  <Input
                    value={draft.provider}
                    onChange={(e) =>
                      setDraft({ ...draft, provider: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Thời lượng (h)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.durationHours}
                    onChange={(e) =>
                      setDraft({ ...draft, durationHours: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Chi phí (VND)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.cost}
                    onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Mô tả</Label>
                <Textarea
                  rows={3}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  placeholder="Nội dung, mục tiêu khoá học…"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Huỷ
            </Button>
            <Button
              disabled={!draft || !draft.title.trim() || saveMutation.isPending}
              onClick={() => draft && saveMutation.mutate(draft)}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TrainingPage() {
  return (
    <PermissionGate
      permission={PERMISSIONS.TRAINING_READ}
      fallback={
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền xem đào tạo.
        </p>
      }
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Đào tạo</h1>
          <p className="text-sm text-muted-foreground">
            Danh mục khoá học, lớp/đăng ký và chứng chỉ.
          </p>
        </div>

        <Tabs defaultValue="sessions">
          <TabsList>
            <TabsTrigger value="sessions">Lớp & Đăng ký</TabsTrigger>
            <TabsTrigger value="my">Của tôi</TabsTrigger>
            <TabsTrigger value="certifications">Chứng chỉ</TabsTrigger>
            <TabsTrigger value="courses">Danh mục khoá</TabsTrigger>
          </TabsList>
          <TabsContent value="sessions" className="mt-4">
            <SessionsTab />
          </TabsContent>
          <TabsContent value="my" className="mt-4">
            <MyEnrollmentsTab />
          </TabsContent>
          <TabsContent value="certifications" className="mt-4">
            <CertificationsTab />
          </TabsContent>
          <TabsContent value="courses" className="mt-4">
            <CoursesTab />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  );
}
