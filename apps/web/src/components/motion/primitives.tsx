'use client';

/**
 * Primitives animation dùng chung toàn app — mọi page dùng qua đây, không
 * viết animation rải rác. Guardrails (per spec 2.12):
 * - Chỉ animate transform/opacity (GPU), duration tương tác ≤ 300ms.
 * - LazyMotion + m.* + domAnimation (không import motion.* đầy đủ).
 * - Tôn trọng prefers-reduced-motion.
 * - animejs CHỈ dynamic-import trong <CountUp> — không vào bundle chung.
 */
import {
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';

export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}

interface MotionBlockProps {
  children: ReactNode;
  className?: string;
  /** Trễ vào (giây) — dùng cho hiệu ứng tuần tự thủ công. */
  delay?: number;
}

export function FadeIn({ children, className, delay = 0 }: MotionBlockProps) {
  const reduced = useReducedMotion();
  return (
    <m.div
      className={className}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, delay }}
    >
      {children}
    </m.div>
  );
}

export function SlideUp({ children, className, delay = 0 }: MotionBlockProps) {
  const reduced = useReducedMotion();
  return (
    <m.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
    >
      {children}
    </m.div>
  );
}

interface StaggerListProps {
  children: ReactNode;
  className?: string;
  /** Khoảng cách giữa các item (giây). */
  stagger?: number;
}

/** Container stagger — bọc các <StaggerItem> con. */
export function StaggerList({ children, className, stagger = 0.05 }: StaggerListProps) {
  const reduced = useReducedMotion();
  return (
    <m.div
      className={className}
      initial={reduced ? false : 'hidden'}
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: stagger } },
      }}
    >
      {children}
    </m.div>
  );
}

export function StaggerItem({ children, className }: MotionBlockProps) {
  return (
    <m.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
      }}
    >
      {children}
    </m.div>
  );
}

interface CountUpProps {
  value: number;
  className?: string;
  /** Thời lượng đếm (giây). */
  duration?: number;
}

/** Số liệu dashboard đếm tăng — animejs dynamic import, reduced-motion = hiện thẳng. */
export function CountUp({ value, className, duration = 1 }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = value.toLocaleString('vi-VN');
      return;
    }
    let cancelled = false;
    void import('animejs').then(({ animate }) => {
      if (cancelled || !ref.current) return;
      const counter = { v: 0 };
      animate(counter, {
        v: value,
        duration: duration * 1000,
        ease: 'outQuad',
        onUpdate: () => {
          if (ref.current) {
            ref.current.textContent = Math.round(counter.v).toLocaleString('vi-VN');
          }
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [value, duration, reduced]);

  return (
    <span ref={ref} className={className}>
      0
    </span>
  );
}
