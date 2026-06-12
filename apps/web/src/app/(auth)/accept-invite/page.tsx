'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSchema } from '@repo/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

// passwordSchema từ @repo/shared — chỉ thêm confirm phía form
const formSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp',
  });

type FormValues = z.infer<typeof formSchema>;

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrate = useAuthStore((s) => s.hydrate);

  const email = searchParams.get('email') ?? '';
  const token = searchParams.get('token') ?? '';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  if (!email || !token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link không hợp lệ</CardTitle>
          <CardDescription>
            Link lời mời thiếu thông tin — hãy mở lại link từ email hoặc nhờ
            quản trị viên gửi lại lời mời.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function onSubmit(values: FormValues) {
    try {
      await api.post('/auth/accept-invite', {
        email,
        token,
        password: values.password,
      });
      await hydrate();
      toast.success('Kích hoạt tài khoản thành công!');
      router.replace('/dashboard');
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : 'Kích hoạt thất bại, thử lại sau',
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kích hoạt tài khoản</CardTitle>
        <CardDescription>
          Đặt mật khẩu cho <b>{email}</b> để bắt đầu sử dụng
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mật khẩu</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nhập lại mật khẩu</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting
                ? 'Đang kích hoạt…'
                : 'Đặt mật khẩu & đăng nhập'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteForm />
    </Suspense>
  );
}
