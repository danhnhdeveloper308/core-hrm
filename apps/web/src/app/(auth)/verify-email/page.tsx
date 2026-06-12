'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
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
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { api, ApiError } from '@/lib/api/client';

const RESEND_COOLDOWN_SECONDS = 60;

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1_000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!email) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Thiếu email</CardTitle>
          <CardDescription>
            Vui lòng đăng ký hoặc đăng nhập để nhận mã xác thực.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button className="w-full" onClick={() => router.push('/register')}>
            Về trang đăng ký
          </Button>
        </CardFooter>
      </Card>
    );
  }

  async function onVerify() {
    setSubmitting(true);
    try {
      const res = await api.post<{ message: string }>('/auth/verify-email', {
        email,
        code,
      });
      toast.success(res.message);
      router.push('/login');
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Xác thực thất bại',
      );
      setCode('');
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    try {
      const res = await api.post<{ message: string }>('/auth/resend-otp', {
        email,
      });
      toast.success(res.message);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Gửi lại mã thất bại',
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Xác thực email</CardTitle>
        <CardDescription>
          Mã 6 số đã được gửi tới <b>{email}</b>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={setCode}
          onComplete={onVerify}
          autoFocus
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <Button
          className="w-full"
          onClick={onVerify}
          disabled={submitting || code.length !== 6}
        >
          {submitting ? 'Đang xác thực…' : 'Xác thực'}
        </Button>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <Button
          variant="ghost"
          size="sm"
          disabled={cooldown > 0}
          onClick={onResend}
        >
          {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : 'Gửi lại mã'}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}
