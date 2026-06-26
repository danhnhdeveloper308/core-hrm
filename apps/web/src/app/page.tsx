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
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { LandingAurora } from '@/components/landing/landing-aurora';
import { FlowDiagram } from '@/components/landing/flow-diagram';
import { LandingNav, SessionCta } from '@/components/landing/landing-nav';
import { FadeIn, SlideUp, StaggerItem, StaggerList } from '@/components/motion/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const GRADIENT_TEXT =
  'bg-linear-to-r from-violet-600 via-fuchsia-500 to-sky-500 bg-clip-text text-transparent';

const FEATURES = [
  {
    icon: ScanFace,
    tint: 'from-violet-500 to-fuchsia-500',
    title: 'Chấm công khuôn mặt & GPS',
    description:
      'Nhận diện khuôn mặt 1:1 khi đăng nhập, 1:N qua kiosk public, chống giả mạo (antispoof) và khoá vùng theo toạ độ + bán kính (geofence).',
  },
  {
    icon: CalendarCheck,
    tint: 'from-sky-500 to-cyan-500',
    title: 'Bảng công tự động',
    description:
      'Tính công theo ca, ngày lễ, đi trễ/về sớm, tăng ca — lấy giờ vào đầu tiên & giờ ra cuối cùng. Quên chấm ra? HR chấm bù một chạm.',
  },
  {
    icon: BadgeCheck,
    tint: 'from-emerald-500 to-teal-500',
    title: 'Đơn từ & phê duyệt đa cấp',
    description:
      'Nghỉ phép, tăng ca, dời giờ, sửa công đi qua luồng duyệt nhiều cấp theo đơn vị, có SLA nhắc và escalate khi quá hạn.',
  },
  {
    icon: ShieldCheck,
    tint: 'from-amber-500 to-orange-500',
    title: 'Phân quyền RBAC đa tổ chức',
    description:
      'Phân quyền resource:action theo vai trò, scope theo cây đơn vị. Đổi quyền hiệu lực ngay nhờ cache-invalidation + đẩy realtime.',
  },
  {
    icon: BellRing,
    tint: 'from-rose-500 to-pink-500',
    title: 'Thông báo realtime đa kênh',
    description:
      'In-app + web push (kể cả khi đóng trình duyệt) + email; bật/tắt từng loại × kênh cho mỗi người dùng như GitHub.',
  },
  {
    icon: FileSpreadsheet,
    tint: 'from-indigo-500 to-blue-500',
    title: 'Báo cáo & nhập/xuất Excel',
    description:
      'Dashboard số liệu, xuất bảng công ra Excel, nhập nhân viên theo file mẫu, hồ sơ nhân sự chuẩn pháp luật VN (CCCD, BHXH, MST…).',
  },
];

const STATS = [
  { value: '3 kênh', label: 'Thông báo realtime' },
  { value: '1:N', label: 'Nhận diện khuôn mặt' },
  { value: 'Đa cấp', label: 'Luồng phê duyệt' },
  { value: '100%', label: 'Type-safe FE↔BE' },
];

const STACK = ['NestJS 11', 'Next.js 16', 'Prisma 7', 'PostgreSQL', 'Redis', 'Socket.IO', 'BullMQ'];

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-violet-600 to-sky-500 text-white shadow-sm">
              <LayoutDashboard className="size-4" />
            </span>
            <span className="text-lg">HRM</span>
          </Link>
          <nav className="flex items-center gap-2">
            <LandingNav />
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <LandingAurora />
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 py-24 text-center sm:py-32">
          <FadeIn>
            <Badge
              variant="secondary"
              className="gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 backdrop-blur"
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              HRM đa doanh nghiệp · Chấm công · Phê duyệt · Realtime
            </Badge>
          </FadeIn>
          <SlideUp delay={0.05}>
            <h1 className="max-w-4xl text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">
              Quản trị nhân sự &amp; <span className={GRADIENT_TEXT}>chấm công thông minh</span> cho
              mọi doanh nghiệp
            </h1>
          </SlideUp>
          <SlideUp delay={0.1}>
            <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
              Chấm công bằng khuôn mặt &amp; định vị, bảng công tự động, đơn từ và phê duyệt đa cấp,
              báo cáo realtime — type-safe từ database tới giao diện.
            </p>
          </SlideUp>
          <SlideUp delay={0.15}>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <SessionCta
                loggedOutLabel="Bắt đầu ngay"
                loggedOutHref="/login"
                className="shadow-lg shadow-violet-500/20"
              />
              <Button asChild variant="outline" size="lg" className="bg-background/60 backdrop-blur">
                <Link href="/login">Đăng nhập</Link>
              </Button>
            </div>
          </SlideUp>
          <FadeIn delay={0.25}>
            <div className="flex max-w-2xl flex-wrap items-center justify-center gap-2 pt-2">
              {STACK.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-border/60 bg-background/50 px-2.5 py-1 font-mono text-xs text-muted-foreground backdrop-blur"
                >
                  {item}
                </span>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border/60 bg-muted/30">
        <StaggerList className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden px-4 sm:grid-cols-4">
          {STATS.map((s) => (
            <StaggerItem key={s.label} className="px-4 py-8 text-center">
              <p className={`text-3xl font-extrabold sm:text-4xl ${GRADIENT_TEXT}`}>{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </StaggerItem>
          ))}
        </StaggerList>
      </section>

      {/* Flow diagram */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-4 py-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold">Một luồng khép kín</h2>
            <p className="mt-2 text-muted-foreground">
              Từ lần chấm công đến báo cáo lãnh đạo — tự động và realtime
            </p>
          </div>
          <div className="rounded-3xl border border-border/60 bg-card/40 p-5 shadow-sm backdrop-blur sm:p-8">
            <FlowDiagram />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative overflow-hidden border-t border-border/60 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Đầy đủ cho vận hành nhân sự</h2>
            <p className="mt-2 text-muted-foreground">
              Không phải demo — từng tính năng đều được kiểm chứng bằng e2e test
            </p>
          </div>
          <StaggerList className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <StaggerItem key={feature.title}>
                <Card className="group relative h-full overflow-hidden border-border/60 bg-card/60 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/40 hover:shadow-xl hover:shadow-violet-500/10">
                  <CardHeader>
                    <span
                      className={`mb-3 flex size-11 items-center justify-center rounded-xl bg-linear-to-br ${feature.tint} text-white shadow-md transition-transform duration-300 group-hover:scale-110`}
                    >
                      <feature.icon className="size-5" />
                    </span>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <CardDescription className="leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </StaggerItem>
            ))}
          </StaggerList>
        </div>
      </section>

      {/* Highlights */}
      <section className="border-t border-border/60">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-16 sm:grid-cols-3">
          {[
            { icon: MapPin, title: 'Geofence chính xác', desc: 'Khoá chấm công theo toạ độ + bán kính worksite.' },
            { icon: Activity, title: 'Audit log tự động', desc: 'Mọi thao tác ghi log kèm diff, redact dữ liệu nhạy cảm.' },
            { icon: BarChart3, title: 'Báo cáo tức thì', desc: 'Dashboard số liệu hôm nay + xuất Excel theo kỳ.' },
          ].map((s) => (
            <FadeIn key={s.title} className="flex flex-col items-center gap-2 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground">
                <s.icon className="size-5" />
              </span>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* CTA panel */}
      <section className="px-4 py-20">
        <SlideUp className="mx-auto max-w-5xl">
          <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-violet-600 via-fuchsia-600 to-sky-600 px-6 py-16 text-center text-white shadow-2xl">
            {/* lưới chấm mờ trên panel — CSS thuần */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.6) 1px, transparent 0)',
                backgroundSize: '22px 22px',
              }}
            />
            <div className="relative flex flex-col items-center gap-4">
              <Sparkles className="size-8" />
              <h2 className="max-w-2xl text-3xl font-bold sm:text-4xl">
                Sẵn sàng triển khai cho doanh nghiệp của bạn
              </h2>
              <p className="max-w-xl text-white/85">
                Đăng nhập để bắt đầu quản lý nhân sự, chấm công và phê duyệt — tất cả ở một nơi.
              </p>
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="mt-2 bg-white text-violet-700 hover:bg-white/90"
              >
                <Link href="/login">
                  Đăng nhập ngay <span aria-hidden>→</span>
                </Link>
              </Button>
            </div>
          </div>
        </SlideUp>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/60">
        <div className="mx-auto flex h-16 max-w-6xl flex-col items-center justify-between gap-2 px-4 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} HRM</span>
          <span>NestJS 11 · Next.js 16 · Prisma 7</span>
        </div>
      </footer>
    </div>
  );
}
