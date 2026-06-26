'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  loginSchema,
  type LoginInput,
  type LoginResponse,
} from '@repo/shared';
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Separator } from '@/components/ui/separator';
import { api, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001/api';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrate = useAuthStore((s) => s.hydrate);
  // null = không có đích cụ thể (login chủ động) → tự chọn theo vai trò
  const explicitNext = searchParams.get('next');

  // OAuth Google với tài khoản đã bật 2FA → BE redirect kèm ?pending2fa=<token>.
  // Khởi tạo ngay từ URL (lazy init) → vào thẳng bước nhập mã 2FA.
  const [pendingToken, setPendingToken] = useState<string | null>(() =>
    searchParams.get('pending2fa'),
  );
  const [otpCode, setOtpCode] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Kiểm tra phiên có sẵn: 'checking' (mới vào) → 'redirecting' (đã đăng nhập) | 'none'.
  // Có ?pending2fa → bỏ qua (đang giữa luồng 2FA, chưa có session đầy đủ).
  const [sessionState, setSessionState] = useState<'checking' | 'none' | 'redirecting'>(
    () => (searchParams.get('pending2fa') ? 'none' : 'checking'),
  );

  useEffect(() => {
    if (searchParams.get('error') === 'oauth') {
      toast.error('Đăng nhập Google thất bại, vui lòng thử lại');
    }
    if (searchParams.get('pending2fa')) {
      toast.info('Tài khoản đã bật 2FA — nhập mã xác thực để hoàn tất');
    }
  }, [searchParams]);

  // Đã có phiên (vd vừa từ /dashboard, hoặc remember-me) → chuyển thẳng dashboard.
  // Dùng fetch THÔ để 401 KHÔNG kích hoạt redirect toàn cục (ta đang ở /login).
  useEffect(() => {
    if (pendingToken || sessionState !== 'checking') return;
    let active = true;
    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then((r) => {
        if (active) setSessionState(r.ok ? 'redirecting' : 'none');
      })
      .catch(() => {
        if (active) setSessionState('none');
      });
    return () => {
      active = false;
    };
  }, [pendingToken, sessionState]);

  useEffect(() => {
    if (sessionState === 'redirecting') router.replace('/dashboard');
  }, [sessionState, router]);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  async function finishLogin() {
    await hydrate();
    // Nhân viên hiện trường (không có quyền quản lý) → mặc định vào /checkin
    const user = useAuthStore.getState().user;
    const isFieldEmployee =
      user?.orgId != null &&
      !user.permissions.includes('employee:read') &&
      !user.permissions.includes('attendance:read_all');
    const home = isFieldEmployee ? '/checkin' : '/dashboard';

    // Tôn trọng đích cụ thể proxy lưu lại, TRỪ '/dashboard' chung chung
    // (để nhân viên bị bounce từ /dashboard vẫn về /checkin)
    if (explicitNext?.startsWith('/') && explicitNext !== '/dashboard') {
      router.replace(explicitNext);
      return;
    }
    router.replace(home);
  }

  async function onSubmit(values: LoginInput) {
    try {
      const res = await api.post<LoginResponse>('/auth/login', values);
      if (res.requires2fa) {
        setPendingToken(res.pending2faToken);
        return;
      }
      await finishLogin();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.errorCode === 'AUTH_EMAIL_NOT_VERIFIED') {
          toast.info(error.message);
          router.push(
            `/verify-email?email=${encodeURIComponent(values.identifier)}`,
          );
          return;
        }
        toast.error(error.message);
        return;
      }
      toast.error('Không kết nối được máy chủ');
    }
  }

  async function onSubmit2fa() {
    if (!pendingToken) return;
    setSubmitting(true);
    try {
      if (recoveryMode) {
        await api.post('/auth/2fa/recovery', {
          pendingToken,
          recoveryCode,
          rememberDevice,
        });
      } else {
        await api.post('/auth/2fa/verify', {
          pendingToken,
          code: otpCode,
          rememberDevice,
        });
      }
      await finishLogin();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Xác thực 2FA thất bại',
      );
      setOtpCode('');
    } finally {
      setSubmitting(false);
    }
  }

  // Đã xác nhận có phiên → overlay chuyển hướng (KHÔNG chặn form ở bước 'checking'
  // để người chưa đăng nhập thấy form ngay, kể cả khi BE cold-start chậm).
  if (sessionState === 'redirecting') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Loader2 className="size-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Đã đăng nhập — đang chuyển hướng sang Dashboard…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (pendingToken) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Xác thực 2 bước</CardTitle>
          <CardDescription>
            {recoveryMode
              ? 'Nhập 1 trong các recovery code đã lưu khi bật 2FA'
              : 'Nhập mã 6 số từ ứng dụng authenticator'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {recoveryMode ? (
            <Input
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="XXXX-XXXX"
              autoFocus
            />
          ) : (
            <InputOTP
              maxLength={6}
              value={otpCode}
              onChange={setOtpCode}
              onComplete={onSubmit2fa}
              autoFocus
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          )}
          <div className="flex items-center gap-2 self-start">
            <Checkbox
              id="remember-device"
              checked={rememberDevice}
              onCheckedChange={(v) => setRememberDevice(v === true)}
            />
            <Label
              htmlFor="remember-device"
              className="text-sm font-normal text-muted-foreground"
            >
              Tin cậy thiết bị này trong 30 ngày
            </Label>
          </div>
          <Button
            className="w-full"
            onClick={onSubmit2fa}
            disabled={
              submitting || (recoveryMode ? !recoveryCode : otpCode.length !== 6)
            }
          >
            {submitting ? 'Đang xác thực…' : 'Xác nhận'}
          </Button>
        </CardContent>
        <CardFooter className="flex-col gap-2 text-sm">
          <button
            type="button"
            className="text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setRecoveryMode((v) => !v)}
          >
            {recoveryMode ? 'Dùng mã từ app authenticator' : 'Mất thiết bị? Dùng recovery code'}
          </button>
          <button
            type="button"
            className="text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setPendingToken(null);
              setOtpCode('');
              setRecoveryMode(false);
            }}
          >
            Quay lại đăng nhập
          </button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đăng nhập</CardTitle>
        <CardDescription>Chào mừng quay lại 👋</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email hoặc mã nhân viên</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="ban@example.com hoặc NV001"
                      autoComplete="username"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Mật khẩu</FormLabel>
                    <Link
                      href="/forgot-password"
                      className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Quên mật khẩu?
                    </Link>
                  </div>
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
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
          </form>
        </Form>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">hoặc</span>
          <Separator className="flex-1" />
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            window.location.href = `${API_URL}/auth/google`;
          }}
        >
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
            <path
              fill="currentColor"
              d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81"
            />
          </svg>
          Đăng nhập với Google
        </Button>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        Chưa có tài khoản?
        <Link href="/register" className="ml-1 text-foreground underline-offset-4 hover:underline">
          Đăng ký
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
