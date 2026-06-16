'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  PERMISSIONS,
  createPositionSchema,
  type CreatePositionInput,
  type PositionResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { toast } from 'sonner';
import { FadeIn } from '@/components/motion/primitives';
import { PermissionGate } from '@/components/permission-gate';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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

export default function PositionsPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PositionResponse | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.org.positions,
    queryFn: () => api.get<PositionResponse[]>('/positions'),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.org.positions });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/positions/${id}`),
    onSuccess: (res) => {
      toast.success(res.message);
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
  });

  return (
    <FadeIn className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chức danh</h1>
          <p className="text-muted-foreground">Danh mục chức danh trong tổ chức</p>
        </div>
        <PermissionGate permission={PERMISSIONS.ORGUNIT_MANAGE}>
          <Button
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Thêm chức danh
          </Button>
        </PermissionGate>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Cấp bậc</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : (
              (data ?? [])
                .slice()
                .sort((a, b) => b.level - a.level)
                .map((position) => (
                <TableRow key={position.id}>
                  <TableCell className="font-medium">{position.name}</TableCell>
                  <TableCell className="font-mono text-xs">{position.code}</TableCell>
                  <TableCell>
                    <span className="inline-flex size-6 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                      {position.level}
                    </span>
                  </TableCell>
                  <TableCell>
                    <PermissionGate permission={PERMISSIONS.ORGUNIT_MANAGE}>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => {
                            setEditTarget(position);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive"
                          onClick={() => deleteMutation.mutate(position.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PositionFormDialog
        open={formOpen}
        target={editTarget}
        onClose={() => setFormOpen(false)}
        onSaved={() => void invalidate()}
      />
    </FadeIn>
  );
}

function PositionFormDialog({
  open,
  target,
  onClose,
  onSaved,
}: {
  open: boolean;
  target: PositionResponse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target !== null;
  const form = useForm<
    z.input<typeof createPositionSchema>,
    unknown,
    CreatePositionInput
  >({
    resolver: zodResolver(createPositionSchema),
    defaultValues: { name: '', code: '', level: 1 },
    values: open
      ? {
          name: target?.name ?? '',
          code: target?.code ?? '',
          level: target?.level ?? 1,
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (values: CreatePositionInput) =>
      isEdit
        ? api.patch<PositionResponse>(`/positions/${target.id}`, values)
        : api.post<PositionResponse>('/positions', values),
    onSuccess: (saved) => {
      toast.success(isEdit ? `Đã cập nhật ${saved.name}` : `Đã thêm ${saved.name}`);
      onSaved();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Lưu thất bại'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Sửa ${target.name}` : 'Thêm chức danh'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên chức danh</FormLabel>
                  <FormControl>
                    <Input placeholder="Trưởng phòng" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="TP" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cấp bậc</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              Cấp bậc càng cao càng nhiều quyền lợi (dùng cho chính sách nghỉ phép
              &amp; định tuyến duyệt ở các bước sau).
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
