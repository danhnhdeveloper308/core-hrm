import { LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LandingAurora } from '@/components/landing/landing-aurora';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden p-4">
      <LandingAurora />

      <Link href="/" className="mb-6 flex items-center gap-2 text-lg font-bold">
        <span className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-violet-600 to-sky-500 text-white shadow-lg">
          <LayoutDashboard className="size-5" />
        </span>
        HRM
      </Link>

      <div className="w-full max-w-md drop-shadow-xl">{children}</div>

      <Link
        href="/"
        className="mt-6 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        ← Về trang chủ
      </Link>
    </main>
  );
}
