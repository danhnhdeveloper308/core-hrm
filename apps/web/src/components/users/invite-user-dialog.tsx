'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  inviteUserSchema,
  type InviteUserInput,
  type OrganizationResponse,
  type Paginated,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
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
  DialogTrigger,
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
import { useAuthStore } from '@/stores/auth-store';

const PLATFORM = '__platform__';

/**
 * Mời user qua email (link đặt mật khẩu, 7 ngày).
 * - Platform admin: chọn 1 tổ chức → mời làm ORG_ADMIN (1 license = 1 công ty);
 *   để trống = user platform (role USER).
 * - Org admin: mời thành viên vào org của mình (role EMPLOYEE mặc định).
 */
export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const [targetOrg, setTargetOrg] = useState<string>(PLATFORM);
  const queryClient = useQueryClient();

  const currentUser = useAuthStore((s) => s.user);
  const isPlatform = currentUser != null && currentUser.orgId == null;

  const { data: orgs } = useQuery({
    queryKey: queryKeys.organizations.list({ limit: 100 }),
    queryFn: () =>
      api.get<Paginated<OrganizationResponse>>('/organizations?limit=100'),
    enabled: open && isPlatform,
  });

  const form = useForm<InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { email: '', name: '' },
  });

  const inviteMutation = useMutation({
    mutationFn: (values: InviteUserInput) =>
      api.post('/users/invite', {
        ...values,
        orgId: isPlatform && targetOrg !== PLATFORM ? targetOrg : undefined,
      }),
    onSuccess: (_, values) => {
      const where =
        isPlatform && targetOrg !== PLATFORM
          ? ' (ORG_ADMIN tổ chức đã chọn)'
          : '';
      toast.success(`Đã gửi lời mời tới ${values.email}${where}`);
      setOpen(false);
      setTargetOrg(PLATFORM);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Gửi lời mời thất bại');
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" /> Mời user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mời user qua email</DialogTitle>
          <DialogDescription>
            User nhận link đặt mật khẩu (hết hạn sau 7 ngày).
            {isPlatform
              ? ' Chọn tổ chức để mời làm ORG_ADMIN, hoặc để trống = user platform.'
              : ' Vào tổ chức của bạn với role EMPLOYEE — gán thêm role sau.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => inviteMutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="admin@congty.vn" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên hiển thị</FormLabel>
                  <FormControl>
                    <Input placeholder="Nguyễn Văn A" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isPlatform && (
              <div className="space-y-1.5">
                <Label>Tổ chức (cấp ORG_ADMIN)</Label>
                <Select value={targetOrg} onValueChange={setTargetOrg}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PLATFORM}>
                      — Không (user platform, role USER)
                    </SelectItem>
                    {(orgs?.items ?? []).map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {targetOrg === PLATFORM
                    ? 'Mời user cấp nền tảng (không thuộc tổ chức nào).'
                    : 'User được mời sẽ là ORG_ADMIN của tổ chức này (1 license).'}
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? 'Đang gửi…' : 'Gửi lời mời'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
