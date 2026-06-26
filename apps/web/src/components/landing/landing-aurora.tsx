'use client';

import { m, useReducedMotion } from 'motion/react';

/**
 * Nền "aurora" cho hero landing — vài khối gradient mờ trôi nhẹ + lưới chấm.
 * Hiệu suất: chỉ animate transform (x/y) trên 3 phần tử, 15–19s/loop; tôn trọng
 * prefers-reduced-motion (đứng yên). Lưới chấm là CSS thuần (inline style).
 */
const BLOBS = [
  { pos: '-left-24 -top-24', color: 'bg-violet-500/30', anim: { x: [0, 40, 0], y: [0, 30, 0] }, dur: 15 },
  { pos: '-right-24 top-10', color: 'bg-sky-500/25', anim: { x: [0, -36, 0], y: [0, 44, 0] }, dur: 17 },
  { pos: 'left-1/3 -bottom-32', color: 'bg-fuchsia-500/25', anim: { x: [0, 28, 0], y: [0, -30, 0] }, dur: 19 },
];

export function LandingAurora() {
  const reduced = useReducedMotion() ?? false;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {BLOBS.map((b) => (
        <m.div
          key={b.pos}
          className={`absolute size-[26rem] rounded-full blur-3xl ${b.pos} ${b.color}`}
          animate={reduced ? undefined : b.anim}
          transition={{ duration: b.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      <div
        className="absolute inset-0 opacity-[0.18] dark:opacity-[0.12]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgb(120 120 120 / 0.5) 1px, transparent 0)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)',
        }}
      />
    </div>
  );
}
