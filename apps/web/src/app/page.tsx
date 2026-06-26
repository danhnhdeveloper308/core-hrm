import {
  Activity,
  BadgeCheck,
  BarChart3,
  BellRing,
  CalendarCheck,
  FileSpreadsheet,
  LayoutDashboard,
  MapPin,
  ScanFace,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { LandingNav, SessionCta } from '@/components/landing/landing-nav';
import { FlowDiagram } from '@/components/landing/flow-diagram';
import { FadeIn, SlideUp, StaggerItem, StaggerList } from '@/components/motion/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const FEATURES = [
  {
    icon: ScanFace,
    title: 'Chấm công khuôn mặt & GPS',
    description:
      'Nhận diện khuôn mặt 1:1 khi đăng nhập và 1:N qua trang kiosk public, chống giả mạo (antispoof), khoá vùng theo toạ độ + bán kính (geofence).',
  },
  {
    icon: CalendarCheck,
    title: 'Bảng công tự động',
    description:
      'Tính công theo ca làm việc, lịch nghỉ lễ, đi trễ/về sớm, tăng ca — lấy giờ vào đầu tiên & giờ ra cuối cùng dù chấm nhiều lần. Quên chấm ra? HR chấm bù 1 chạm.',
  },
  {
    icon: BadgeCheck,
    title: 'Đơn từ & phê duyệt đa cấp',
    description:
      'Nghỉ phép, tăng ca, dời giờ, sửa công đi qua luồng duyệt nhiều cấp theo đơn vị, có SLA nhắc/escalate khi quá hạn.',
  },
  {
    icon: ShieldCheck,
    title: 'Phân quyền RBAC đa tổ chức',
    description:
      'Phân quyền resource:action theo vai trò, scope theo cây đơn vị. Đổi quyền có hiệu lực ngay nhờ cache-invalidation + đẩy realtime.',
  },
  {
    icon: BellRing,
    title: 'Thông báo realtime đa kênh',
    description:
      'In-app + web push (kể cả khi đóng trình duyệt) + email, tuỳ chọn bật/tắt từng loại × kênh cho mỗi người dùng như GitHub.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Báo cáo & nhập/xuất Excel',
    description:
      'Dashboard số liệu, xuất bảng công ra Excel, nhập danh sách nhân viên theo file mẫu, hồ sơ nhân sự chuẩn pháp luật VN (CCCD, BHXH, MST…).',
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
];

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <LayoutDashboard className="size-5 text-primary" />
            HRM
          </Link>
          <nav className="flex items-center gap-2">
            <LandingNav />
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* nền gradient nhẹ — thuần CSS, không tốn JS */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-primary/10 to-transparent" />
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:py-28">
          <FadeIn>
            <Badge variant="secondary" className="px-3 py-1">
              HRM đa doanh nghiệp · Chấm công · Nghỉ phép · Phê duyệt
            </Badge>
          </FadeIn>
          <SlideUp delay={0.05}>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
              Quản trị nhân sự &amp; chấm công thông minh cho mọi doanh nghiệp
            </h1>
          </SlideUp>
          <SlideUp delay={0.1}>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Chấm công bằng khuôn mặt và định vị, bảng công tự động, đơn từ &amp;
              phê duyệt đa cấp, báo cáo realtime — type-safe từ database tới giao diện.
            </p>
          </SlideUp>
          <SlideUp delay={0.15}>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <SessionCta loggedOutLabel="Bắt đầu ngay" loggedOutHref="/login" />
              <Button asChild variant="outline" size="lg">
                <Link href="/login">Đăng nhập</Link>
              </Button>
            </div>
          </SlideUp>
          <div className="flex max-w-2xl flex-wrap items-center justify-center gap-2 pt-4">
            {STACK.map((item) => (
              <Badge key={item} variant="outline" className="font-mono text-xs">
                {item}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Flow diagram */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">Một luồng khép kín</h2>
            <p className="mt-2 text-muted-foreground">
              Từ lần chấm công đến báo cáo lãnh đạo — tự động và realtime
            </p>
          </div>
          <FlowDiagram />
        </div>
      </section>

      {/* Features */}
      <section className="border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-20">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold">Đầy đủ cho vận hành nhân sự</h2>
            <p className="mt-2 text-muted-foreground">
              Không phải demo — từng tính năng đều được kiểm chứng bằng e2e test
            </p>
          </div>
          <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <StaggerItem key={feature.title}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <feature.icon className="mb-2 size-8 text-primary" />
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              </StaggerItem>
            ))}
          </StaggerList>
        </div>
      </section>

      {/* Điểm nhấn nghiệp vụ */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-16 sm:grid-cols-3">
          {[
            { icon: MapPin, title: 'Geofence chính xác', desc: 'Khoá chấm công theo toạ độ + bán kính worksite.' },
            { icon: Activity, title: 'Audit log tự động', desc: 'Mọi thao tác ghi log kèm diff, redact dữ liệu nhạy cảm.' },
            { icon: BarChart3, title: 'Báo cáo tức thì', desc: 'Dashboard số liệu hôm nay + xuất Excel theo kỳ.' },
          ].map((s) => (
            <FadeIn key={s.title} className="flex flex-col items-center gap-2 text-center">
              <s.icon className="size-7 text-primary" />
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* CTA cuối */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-20 text-center">
        <h2 className="text-3xl font-bold">Sẵn sàng triển khai cho doanh nghiệp của bạn</h2>
        <p className="max-w-xl text-muted-foreground">
          Đăng nhập để bắt đầu quản lý nhân sự, chấm công và phê duyệt — tất cả ở một nơi.
        </p>
        <SessionCta loggedOutLabel="Đăng nhập ngay" loggedOutHref="/login" className="mt-2" />
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
