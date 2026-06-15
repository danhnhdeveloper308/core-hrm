'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  PERMISSIONS,
  createOrgUnitTypeSchema,
  type CreateOrgUnitTypeInput,
  type OrgUnitTypeResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FadeIn } from '@/components/motion/primitives';
import { PermissionGate } from '@/components/permission-gate';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

export default function UnitTypesPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OrgUnitTypeResponse | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.org.unitTypes,
    queryFn: () => api.get<OrgUnitTypeResponse[]>('/org-unit-types'),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.org.unitTypes });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(`/org-unit-types/${id}`),
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
          <h1 className="text-2xl font-bold">Loại đơn vị</h1>
          <p className="text-muted-foreground">
            Các tầng trong cây tổ chức (Tập đoàn, Nhà máy, Phòng ban...)
          </p>
        </div>
        <PermissionGate permission={PERMISSIONS.ORGUNIT_MANAGE}>
          <Button
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Thêm loại
          </Button>
        </PermissionGate>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Thứ tự tầng</TableHead>
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
              (data ?? []).map((type) => (
                <TableRow key={type.id}>
                  <TableCell className="font-medium">{type.name}</TableCell>
                  <TableCell className="font-mono text-xs">{type.code}</TableCell>
                  <TableCell>{type.rank}</TableCell>
                  <TableCell>
                    <PermissionGate permission={PERMISSIONS.ORGUNIT_MANAGE}>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => {
                            setEditTarget(type);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive"
                          onClick={() => deleteMutation.mutate(type.id)}
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

      <TypeFormDialog
        open={formOpen}
        target={editTarget}
        onClose={() => setFormOpen(false)}
        onSaved={() => void invalidate()}
      />
    </FadeIn>
  );
}

function TypeFormDialog({
  open,
  target,
  onClose,
  onSaved,
}: {
  open: boolean;
  target: OrgUnitTypeResponse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target !== null;
  // Schema có .default() → input/output khác type, cần generic 3 tham số
  const form = useForm<
    z.input<typeof createOrgUnitTypeSchema>,
    unknown,
    CreateOrgUnitTypeInput
  >({
    resolver: zodResolver(createOrgUnitTypeSchema),
    defaultValues: { code: '', name: '', rank: 0 },
    values: open
      ? {
          code: target?.code ?? '',
          name: target?.name ?? '',
          rank: target?.rank ?? 0,
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (values: CreateOrgUnitTypeInput) =>
      isEdit
        ? api.patch<OrgUnitTypeResponse>(`/org-unit-types/${target.id}`, values)
        : api.post<OrgUnitTypeResponse>('/org-unit-types', values),
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
          <DialogTitle>{isEdit ? `Sửa ${target.name}` : 'Thêm loại đơn vị'}</DialogTitle>
          <DialogDescription>
            Rank chỉ gợi ý thứ tự hiển thị — cây không ép đúng tầng.
          </DialogDescription>
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
                  <FormLabel>Tên</FormLabel>
                  <FormControl>
                    <Input placeholder="Nhà máy" {...field} />
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
                      <Input placeholder="NHA_MAY" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rank"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Thứ tự tầng</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
