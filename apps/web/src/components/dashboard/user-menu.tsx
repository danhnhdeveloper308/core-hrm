'use client';

import { LogOut, Moon, MonitorSmartphone, Sun, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api/client';
import { initials } from '@/lib/format';
import { disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';

export function UserMenu() {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  if (!user) return null;

  async function logout(allDevices: boolean) {
    try {
      await api.post(allDevices ? '/auth/logout-all' : '/auth/logout');
    } catch {
      // cookie có thể đã hết hạn — vẫn clear local
    }
    clear();
    disconnectSocket();
    router.replace('/login');
    toast.success(allDevices ? 'Đã đăng xuất mọi thiết bị' : 'Đã đăng xuất');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <Avatar className="size-7">
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={user.name} />
            ) : null}
            <AvatarFallback className="text-xs">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm sm:inline">
            {user.name}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {user.email ?? user.username}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
          <User className="size-4" /> Hồ sơ
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
          Đổi giao diện
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void logout(false)}>
          <LogOut className="size-4" /> Đăng xuất
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => void logout(true)}
        >
          <MonitorSmartphone className="size-4" /> Đăng xuất mọi thiết bị
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
