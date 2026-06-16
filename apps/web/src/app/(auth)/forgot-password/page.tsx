'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  forgotPasswordSchema,
  resetPasswordByIdentitySchema,
  type ForgotPasswordInput,
  type ResetPasswordByIdentityInput,
} from '@repo/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api/client';

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quên mật khẩu</CardTitle>
        <CardDescription>Chọn cách khôi phục phù hợp với tài khoản</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="email">
          <TabsList className="w-full">
            <TabsTrigger value="email" className="flex-1">
              Qua email
            </TabsTrigger>
            <TabsTrigger value="identity" className="flex-1">
              Qua mã NV + SĐT
            </TabsTrigger>
          </TabsList>
          <TabsContent value="email" className="pt-4">
            <EmailForm />
          </TabsContent>
          <TabsContent value="identity" className="pt-4">
            <IdentityForm />
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        <Link href="/login" className="underline-offset-4 hover:underline">
          Quay lại đăng nhập
        </Link>
      </CardFooter>
    </Card>
  );
}

function EmailForm() {
  const router = useRouter();
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    try {
      const res = await api.post<{ message: string }>('/auth/forgot-password', values);
      toast.success(res.message);
      router.push(`/reset-password?email=${encodeURIComponent(values.email)}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Không kết nối được máy chủ');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="ban@example.com" autoComplete="email" {...field} />
              </FormControl>
              <FormDescription>Nếu tài khoản tồn tại, mã OTP sẽ được gửi tới.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Đang gửi…' : 'Gửi mã đặt lại'}
        </Button>
      </form>
    </Form>
  );
}

function IdentityForm() {
  const router = useRouter();
  const form = useForm<ResetPasswordByIdentityInput>({
    resolver: zodResolver(resetPasswordByIdentitySchema),
    defaultValues: { employeeCode: '', phone: '', newPassword: '' },
  });

  async function onSubmit(values: ResetPasswordByIdentityInput) {
    try {
      const res = await api.post<{ message: string }>(
        '/auth/reset-password-by-identity',
        values,
      );
      toast.success(res.message);
      router.push('/login');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Không kết nối được máy chủ');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Dành cho nhân viên không có email: nhập mã nhân viên và số điện thoại đã đăng
          ký để đặt lại mật khẩu.
        </p>
        <FormField
          control={form.control}
          name="employeeCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mã nhân viên</FormLabel>
              <FormControl>
                <Input placeholder="NV001" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Số điện thoại</FormLabel>
              <FormControl>
                <Input placeholder="09xxxxxxxx" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mật khẩu mới</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription>Tối thiểu 8 ký tự, có chữ và số.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
        </Button>
      </form>
    </Form>
  );
}
