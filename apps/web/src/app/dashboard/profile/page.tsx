'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
  type UserResponse,
} from '@repo/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { TwoFactorCard } from '@/components/profile/two-factor-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { initials } from '@/lib/format';
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

function ProfileCard() {
  const user = useAuthStore((s) => s.user);
  const hydrate = useAuthStore((s) => s.hydrate);
  const [uploading, setUploading] = useState(false);

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    values: { name: user?.name ?? '' },
  });

  async function onSubmit(values: UpdateProfileInput) {
    try {
      await api.patch<UserResponse>('/users/me', values);
      await hydrate();
      toast.success('Đã cập nhật hồ sơ');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Cập nhật thất bại');
    }
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại cùng file
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      await api.upload<{ avatarUrl: string }>('/users/me/avatar', fd);
      await hydrate();
      toast.success('Đã cập nhật ảnh đại diện');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Tải ảnh thất bại');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin cá nhân</CardTitle>
        <CardDescription>{user?.email}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name} /> : null}
            <AvatarFallback className="text-lg">
              {initials(user?.name ?? '?')}
            </AvatarFallback>
          </Avatar>
          <div>
            <label htmlFor="avatar-upload">
              <Button asChild variant="outline" size="sm" disabled={uploading}>
                <span>{uploading ? 'Đang tải…' : 'Đổi ảnh đại diện'}</span>
              </Button>
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void onAvatarChange(e)}
            />
            <p className="mt-1 text-xs text-muted-foreground">JPG/PNG/WEBP ≤ 5MB</p>
          </div>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Họ tên</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Đang lưu…' : 'Lưu thay đổi'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  async function onSubmit(values: ChangePasswordInput) {
    try {
      const res = await api.post<{ message: string }>(
        '/auth/change-password',
        values,
      );
      toast.success(res.message);
      form.reset();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Đổi mật khẩu thất bại',
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đổi mật khẩu</CardTitle>
        <CardDescription>
          Các phiên đăng nhập khác sẽ bị thu hồi sau khi đổi
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mật khẩu hiện tại</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      {...field}
                    />
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
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Đang đổi…' : 'Đổi mật khẩu'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Hồ sơ</h1>
      <ProfileCard />
      <ChangePasswordCard />
      <TwoFactorCard />
    </div>
  );
}
