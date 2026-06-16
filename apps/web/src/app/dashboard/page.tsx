'use client';

import {
  PERMISSIONS,
  type AttendanceLogResponse,
  type Paginated,
  type SessionResponse,
  type UserResponse,
} from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import {
  LogIn,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { PermissionGate } from '@/components/permission-gate';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { useAuthStore } from '@/stores/auth-store';

interface TodayResponse {
  logs: AttendanceLogResponse[];
  serverTime: string;
}

function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** Trạng thái chấm công hôm nay + nút check-in/checkout nhanh. */
function TodayCheckinCard() {
  const { data, isError } = useQuery({
    queryKey: ['attendance', 'me', 'today'],
    queryFn: () => api.get<TodayResponse>('/attendance/me/today'),
    retry: false,
  });

  // Tài khoản chưa gắn hồ sơ nhân viên → ẩn card
  if (isError) return null;

  const logs = data?.logs ?? [];
  const last = logs[logs.length - 1];
  const isWorking = last?.type === 'IN';

  return (
    <Card className={isWorking ? 'border-emerald-500/40' : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span
            className={`size-2.5 rounded-full ${isWorking ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/40'}`}
          />
          Chấm công hôm nay
        </CardTitle>
        <CardDescription>
          {logs.length === 0
            ? 'Bạn chưa chấm công hôm nay'
            : isWorking
              ? `Đang trong giờ làm — vào lúc ${timeStr(last.recordedAt)}`
              : `Đã chấm RA lúc ${last ? timeStr(last.recordedAt) : ''}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        {isWorking ? (
          <Button asChild className="bg-orange-600 hover:bg-orange-700">
            <Link href="/checkin?action=OUT">
              <LogOut className="size-4" /> Chấm công RA
            </Link>
          </Button>
        ) : (
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
            <Link href="/checkin?action=IN">
              <LogIn className="size-4" /> Chấm công VÀO
            </Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href="/dashboard/my-attendance">Xem lịch sử</Link>
        </Button>
        {logs.length > 0 && (
          <span className="ml-auto text-sm text-muted-foreground">
            {logs.length} lượt chấm hôm nay
          </span>
        )}
      </CardContent>
    </Card>
  );
}

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

      <TodayCheckinCard />

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
