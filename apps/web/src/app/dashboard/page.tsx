'use client';

import { PERMISSIONS, type Paginated, type SessionResponse, type UserResponse } from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { MonitorSmartphone, ShieldCheck, Users } from 'lucide-react';
import { PermissionGate } from '@/components/permission-gate';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { useAuthStore } from '@/stores/auth-store';

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: string | number;
  icon: typeof Users;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TotalUsersCard() {
  const { data } = useQuery({
    queryKey: queryKeys.users.list({ page: 1, limit: 1 }),
    queryFn: () => api.get<Paginated<UserResponse>>('/users?page=1&limit=1'),
  });
  return (
    <StatCard
      title="Tổng người dùng"
      value={data?.meta.total ?? '—'}
      icon={Users}
    />
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const { data: sessions } = useQuery({
    queryKey: queryKeys.sessions.mine,
    queryFn: () => api.get<SessionResponse[]>('/sessions/me'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Xin chào, {user?.name ?? 'bạn'} 👋
        </h1>
        <p className="text-muted-foreground">
          Tổng quan tài khoản và hệ thống
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Phiên đang hoạt động"
          value={sessions?.length ?? '—'}
          icon={MonitorSmartphone}
          description="Quản lý tại mục Bảo mật"
        />
        <StatCard
          title="Bảo mật 2 lớp"
          value={user?.totpEnabled ? 'Đang bật' : 'Chưa bật'}
          icon={ShieldCheck}
          description={user?.totpEnabled ? undefined : 'Bật 2FA trong Hồ sơ'}
        />
        <PermissionGate permission={PERMISSIONS.USER_READ}>
          <TotalUsersCard />
        </PermissionGate>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quyền của bạn</CardTitle>
          <CardDescription>
            Vai trò: {user?.roles.map((r) => r.name).join(', ') || '—'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {user?.permissions.map((p) => (
            <Badge key={p} variant="secondary">
              {p}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
