'use client';

import { PERMISSIONS, type Permission } from '@repo/shared';
import {
  Briefcase,
  Building2,
  CalendarDays,
  Clock,
  Contact,
  FolderTree,
  Layers,
  LayoutDashboard,
  MapPin,
  ScrollText,
  Shield,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useUiStore } from '@/stores/ui-store';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** null = ai đăng nhập cũng thấy. */
  permission: Permission | null;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
  { href: '/dashboard/organizations', label: 'Tổ chức', icon: Building2, permission: PERMISSIONS.ORG_CREATE },
  { href: '/dashboard/employees', label: 'Nhân viên', icon: Contact, permission: PERMISSIONS.EMPLOYEE_READ },
  { href: '/dashboard/users', label: 'Người dùng', icon: Users, permission: PERMISSIONS.USER_READ },
  { href: '/dashboard/roles', label: 'Vai trò', icon: Shield, permission: PERMISSIONS.ROLE_READ },
  { href: '/dashboard/settings/org-structure', label: 'Cơ cấu tổ chức', icon: FolderTree, permission: PERMISSIONS.ORGUNIT_MANAGE },
  { href: '/dashboard/settings/unit-types', label: 'Loại đơn vị', icon: Layers, permission: PERMISSIONS.ORGUNIT_MANAGE },
  { href: '/dashboard/settings/positions', label: 'Chức danh', icon: Briefcase, permission: PERMISSIONS.ORGUNIT_MANAGE },
  { href: '/dashboard/settings/worksites', label: 'Địa điểm', icon: MapPin, permission: PERMISSIONS.WORKSITE_MANAGE },
  { href: '/dashboard/settings/shifts', label: 'Ca làm việc', icon: Clock, permission: PERMISSIONS.SHIFT_MANAGE },
  { href: '/dashboard/settings/holidays', label: 'Lịch nghỉ lễ', icon: CalendarDays, permission: PERMISSIONS.SHIFT_MANAGE },
  { href: '/dashboard/audit', label: 'Audit log', icon: ScrollText, permission: PERMISSIONS.AUDIT_READ },
  { href: '/dashboard/security', label: 'Bảo mật', icon: ShieldCheck, permission: null },
  { href: '/dashboard/profile', label: 'Hồ sơ', icon: User, permission: null },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const can = useAuthStore((s) => s.can);
  const user = useAuthStore((s) => s.user);

  // Lọc menu theo permission — backend vẫn chặn nếu cố truy cập
  const items = NAV_ITEMS.filter(
    (item) => item.permission === null || (user !== null && can(item.permission)),
  );

  return (
    <nav className="flex flex-col gap-1 p-2">
      {items.map((item) => {
        const active =
          item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-60 shrink-0 border-r bg-sidebar md:block">
        <div className="flex h-14 items-center border-b px-4 font-semibold">
          HRM
        </div>
        <NavLinks />
      </aside>

      {/* Mobile */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="flex h-14 items-center border-b px-4 text-base">
            HRM
          </SheetTitle>
          <NavLinks onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
