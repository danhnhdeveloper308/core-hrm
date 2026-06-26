'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSessionFlag } from './use-session-flag';

/** Nav phải của header landing — đổi theo phiên đăng nhập (client). */
export function LandingNav() {
  const authed = useSessionFlag();

  if (authed === null) {
    return <Skeleton className="h-8 w-40" />;
  }

  if (authed) {
    return (
      <Button asChild size="sm">
        <Link href="/dashboard">
          Vào dashboard <ArrowRight className="size-4" />
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm">
        <Link href="/login">Đăng nhập</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/register">Đăng ký</Link>
      </Button>
    </>
  );
}

interface SessionCtaProps {
  size?: 'default' | 'lg';
  /** Nhãn + đích khi CHƯA đăng nhập. */
  loggedOutLabel?: string;
  loggedOutHref?: string;
  className?: string;
}

/** Nút CTA chính — đăng nhập rồi thì "Vào dashboard", chưa thì đăng ký/đăng nhập. */
export function SessionCta({
  size = 'lg',
  loggedOutLabel = 'Bắt đầu ngay',
  loggedOutHref = '/login',
  className,
}: SessionCtaProps) {
  const authed = useSessionFlag();
  const href = authed ? '/dashboard' : loggedOutHref;
  const label = authed ? 'Vào dashboard' : loggedOutLabel;

  return (
    <Button asChild size={size} className={className}>
      <Link href={href}>
        {label} <ArrowRight className="size-4" />
      </Link>
    </Button>
  );
}
