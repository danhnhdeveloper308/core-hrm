'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createRoleSchema,
  type CreateRoleInput,
  type RoleResponse,
} from '@repo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

interface RoleFormDialogProps {
  open: boolean;
  /** null = tạo mới, có giá trị = sửa. */
  role: RoleResponse | null;
  onClose: () => void;
}

export function RoleFormDialog({ open, role, onClose }: RoleFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = role !== null;

  const form = useForm<CreateRoleInput>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: { name: '', description: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: role?.name ?? '',
        description: role?.description ?? '',
      });
    }
  }, [open, role, form]);

  const mutation = useMutation({
    mutationFn: (values: CreateRoleInput) =>
      isEdit
        ? api.patch<RoleResponse>(`/roles/${role.id}`, values)
        : api.post<RoleResponse>('/roles', values),
    onSuccess: (saved) => {
      toast.success(isEdit ? `Đã cập nhật ${saved.name}` : `Đã tạo role ${saved.name}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Lưu role thất bại'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Sửa role ${role.name}` : 'Tạo role mới'}</DialogTitle>
          <DialogDescription>
            Sau khi tạo, mở &quot;Phân quyền&quot; để gán permissions.
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
                  <FormLabel>Tên role</FormLabel>
                  <FormControl>
                    <Input placeholder="CONTENT_EDITOR" {...field} />
                  </FormControl>
                  <FormDescription>
                    CHỮ_HOA, số và gạch dưới
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mô tả</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Quản lý nội dung…"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Đang lưu…' : isEdit ? 'Cập nhật' : 'Tạo role'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
