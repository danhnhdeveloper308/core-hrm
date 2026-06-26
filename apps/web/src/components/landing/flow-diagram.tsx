'use client';

import { BadgeCheck, BarChart3, Bell, CalendarCheck, ScanFace } from 'lucide-react';
import { m, useReducedMotion, type Variants } from 'motion/react';

/**
 * Sơ đồ luồng HRM sống động — chấm công → bảng công → phê duyệt → báo cáo.
 * Hiệu suất: CHỈ animate transform/opacity (GPU); connector dùng 1 lớp gradient
 * trượt (translateX). Tôn trọng prefers-reduced-motion (tắt animation lặp).
 */
const STEPS = [
  { icon: ScanFace, title: 'Chấm công', desc: 'Khuôn mặt · GPS · Kiosk' },
  { icon: CalendarCheck, title: 'Bảng công', desc: 'Tự tính ca · OT · trễ/sớm' },
  { icon: BadgeCheck, title: 'Phê duyệt', desc: 'Nghỉ · tăng ca · sửa công' },
  { icon: BarChart3, title: 'Báo cáo', desc: 'Dashboard · Excel · realtime' },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const node: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: 'easeOut' } },
};

function Connector({ reduced, delay }: { reduced: boolean; delay: number }) {
  return (
    <div className="relative mx-1 hidden h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-border md:block">
      {!reduced && (
        <m.div
          className="absolute inset-y-0 w-1/3 rounded-full bg-linear-to-r from-transparent via-primary to-transparent"
          animate={{ x: ['-110%', '410%'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay }}
        />
      )}
    </div>
  );
}

export function FlowDiagram() {
  const reduced = useReducedMotion() ?? false;

  return (
    <m.div
      className="flex flex-col items-stretch gap-3 md:flex-row md:items-center"
      variants={container}
      initial={reduced ? false : 'hidden'}
      animate="show"
    >
      {STEPS.map((step, i) => (
        <div key={step.title} className="flex items-center md:flex-1 md:flex-col">
          <m.div
            variants={node}
            className="flex w-full flex-1 items-center gap-3 rounded-xl border bg-card/60 p-4 backdrop-blur md:flex-col md:text-center"
          >
            <div className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <step.icon className="size-6 text-primary" />
              {!reduced && (
                <m.span
                  className="absolute inset-0 rounded-full ring-2 ring-primary/40"
                  animate={{ scale: [1, 1.35], opacity: [0.5, 0] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeOut',
                    delay: i * 0.4,
                  }}
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold leading-tight">{step.title}</p>
              <p className="text-xs text-muted-foreground">{step.desc}</p>
            </div>
          </m.div>
          {i < STEPS.length - 1 && <Connector reduced={reduced} delay={i * 0.3} />}
        </div>
      ))}

      {/* Lớp realtime/thông báo bao quanh toàn luồng */}
      <m.div
        variants={node}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed bg-primary/5 px-4 py-3 text-sm text-primary md:flex-col md:px-3 md:text-center"
      >
        <Bell className="size-5" />
        <span className="font-medium">Realtime &amp; thông báo</span>
      </m.div>
    </m.div>
  );
}
