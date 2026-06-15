'use client';

import { Menu } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { UserMenu } from '@/components/dashboard/user-menu';
import { RealtimeProvider } from '@/components/providers/realtime-provider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth-store';
import { useUiStore } from '@/stores/ui-store';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const hydrate = useAuthStore((s) => s.hydrate);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  // Hydrate store từ /auth/me — fetch wrapper tự refresh nếu access token hết hạn
  useEffect(() => {
    if (status === 'loading') void hydrate();
  }, [status, hydrate]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-60 border-r p-4 md:block">
          <Skeleton className="mb-6 h-8 w-32" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="mb-2 h-9 w-full" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="mb-4 h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // status unauthenticated → setUnauthorizedHandler đã redirect /login

  return (
    <RealtimeProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b px-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={toggleSidebar}
              aria-label="Mở menu"
            >
              <Menu className="size-5" />
            </Button>
            <div className="flex-1" />
            <UserMenu />
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  );
}
