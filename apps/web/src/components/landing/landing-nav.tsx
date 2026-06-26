'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LandingUserMenu, ThemeToggleButton } from './landing-user-menu';
import { useSession } from './use-session';

/** Nav phải của header landing — đổi theo phiên đăng nhập (client). */
export function LandingNav() {
  const { loading, user } = useSession();

  if (loading) {
    return <Skeleton className="h-9 w-36" />;
  }

  if (user) {
    return <LandingUserMenu user={user} />;
  }

  return (
    <div className="flex items-center gap-1">
      <ThemeToggleButton />
      <Button asChild variant="ghost" size="sm">
        <Link href="/login">Đăng nhập</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/register">Đăng ký</Link>
      </Button>
    </div>
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
  const { user } = useSession();
  const href = user ? '/dashboard' : loggedOutHref;
  const label = user ? 'Vào dashboard' : loggedOutLabel;

  return (
    <Button asChild size={size} className={className}>
      <Link href={href}>
        {label} <ArrowRight className="size-4" />
      </Link>
    </Button>
  );
}
