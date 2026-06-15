import {
  Activity,
  ArrowRight,
  Container,
  Fingerprint,
  LayoutDashboard,
  Radio,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const FEATURES = [
  {
    icon: Fingerprint,
    title: 'Xác thực đầy đủ',
    description:
      'Đăng ký với OTP email, đăng nhập, 2FA TOTP kèm recovery codes, Google OAuth và quên mật khẩu — sẵn sàng dùng ngay.',
  },
  {
    icon: ShieldCheck,
    title: 'Phiên đăng nhập an toàn',
    description:
      'Refresh token rotation với reuse detection: token bị đánh cắp và dùng lại → mọi phiên bị thu hồi ngay lập tức.',
  },
  {
    icon: Users,
    title: 'RBAC realtime',
    description:
      'Phân quyền resource:action theo vai trò. Đổi quyền là có hiệu lực ngay — cache invalidate và đẩy realtime tới client.',
  },
  {
    icon: Radio,
    title: 'Realtime mặc định',
    description:
      'Socket.IO với Redis adapter scale ngang: thu hồi phiên, force logout, audit log mới — tất cả đến client tức thì.',
  },
  {
    icon: Activity,
    title: 'Audit log tự động',
    description:
      'Mọi thao tác ghi được log kèm diff, redact dữ liệu nhạy cảm, ghi qua queue không chặn request, xem realtime với virtual scroll.',
  },
  {
    icon: Container,
    title: 'Production-ready',
    description:
      'Docker multi-stage, healthcheck, graceful shutdown, rate limit, helmet, zod validate env — deploy bằng một lệnh compose.',
  },
];

const STACK = [
  'NestJS 11',
  'Next.js 16',
  'Prisma 7',
  'PostgreSQL',
  'Redis',
  'Socket.IO',
  'BullMQ',
  'Tailwind v4',
  'shadcn/ui',
  'Zod v4',
];

export default async function LandingPage() {
  // Chỉ để chọn CTA — quyền thật vẫn do proxy + API kiểm tra
  const cookieStore = await cookies();
  const maybeLoggedIn = cookieStore.has('access_token');

  return (
    <div className="flex min-h-svh flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <LayoutDashboard className="size-5" />
            HRM
          </Link>
          <nav className="flex items-center gap-2">
            {maybeLoggedIn ? (
              <Button asChild size="sm">
                <Link href="/dashboard">
                  Vào dashboard <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Đăng nhập</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">Đăng ký miễn phí</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center">
        <Badge variant="secondary" className="px-3 py-1">
          Monorepo template — Auth · RBAC · Realtime
        </Badge>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Nền tảng auth chuẩn production cho sản phẩm tiếp theo của bạn
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Bỏ qua 2 tháng dựng auth, phân quyền và realtime. Bắt đầu với một
          codebase đã có 2FA, refresh rotation, RBAC cache-invalidation và
          audit log realtime — toàn bộ type-safe từ database tới giao diện.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href={maybeLoggedIn ? '/dashboard' : '/register'}>
              Bắt đầu ngay <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/login">Đăng nhập</Link>
          </Button>
        </div>
        <div className="flex max-w-2xl flex-wrap items-center justify-center gap-2 pt-4">
          {STACK.map((item) => (
            <Badge key={item} variant="outline" className="font-mono text-xs">
              {item}
            </Badge>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold">Mọi thứ một hệ thống nội bộ cần</h2>
            <p className="mt-2 text-muted-foreground">
              Không phải demo — từng tính năng đều được kiểm chứng bằng e2e test
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <feature.icon className="mb-2 size-8 text-primary" />
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA cuối */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-20 text-center">
        <h2 className="text-3xl font-bold">Sẵn sàng trong 5 phút</h2>
        <Card className="w-full max-w-xl">
          <CardContent className="pt-6">
            <pre className="overflow-x-auto rounded-md bg-muted p-4 text-left text-sm">
              <code>{`cp .env.example .env
pnpm install && pnpm db:up
pnpm db:migrate init && pnpm db:seed
pnpm dev`}</code>
            </pre>
          </CardContent>
        </Card>
        <Button asChild size="lg" className="mt-2">
          <Link href={maybeLoggedIn ? '/dashboard' : '/register'}>
            Tạo tài khoản đầu tiên <ArrowRight className="size-4" />
          </Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} HRM</span>
          <span>NestJS 11 · Next.js 16 · Prisma 7</span>
        </div>
      </footer>
    </div>
  );
}
