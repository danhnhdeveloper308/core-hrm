'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ORG_PRESET_LABELS,
  createOrganizationSchema,
  type CreateOrganizationInput,
  type OrganizationResponse,
} from '@repo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

interface OrgFormDialogProps {
  open: boolean;
  onClose: () => void;
}

export function OrgFormDialog({ open, onClose }: OrgFormDialogProps) {
  const queryClient = useQueryClient();

  // Schema có .default() → input/output khác type, cần generic 3 tham số
  const form = useForm<
    z.input<typeof createOrganizationSchema>,
    unknown,
    CreateOrganizationInput
  >({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      name: '',
      slug: '',
      timezone: 'Asia/Ho_Chi_Minh',
      preset: 'SINGLE_COMPANY',
      adminEmail: '',
      adminName: '',
    },
  });

  useEffect(() => {
    if (open) form.reset();
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: (values: CreateOrganizationInput) =>
      api.post<OrganizationResponse>('/organizations', values),
    onSuccess: (org) => {
      toast.success(`Đã tạo tổ chức ${org.name} và gửi lời mời admin`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Tạo tổ chức thất bại'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo tổ chức mới</DialogTitle>
          <DialogDescription>
            Hệ thống tự tạo cơ cấu theo preset, 4 role mặc định và mời org admin
            đầu tiên qua email.
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
                  <FormLabel>Tên tổ chức</FormLabel>
                  <FormControl>
                    <Input placeholder="Tập đoàn ABC" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input placeholder="tap-doan-abc" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="preset"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cơ cấu</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(ORG_PRESET_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="adminName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên org admin</FormLabel>
                  <FormControl>
                    <Input placeholder="Nguyễn Văn A" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="adminEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email org admin</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="admin@abc.vn" {...field} />
                  </FormControl>
                  <FormDescription>
                    Nhận link kích hoạt tài khoản (hết hạn 7 ngày)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Đang tạo…' : 'Tạo tổ chức'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
