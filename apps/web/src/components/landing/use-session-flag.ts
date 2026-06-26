'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001/api';

// Cache + dedupe ở module-scope: nhiều island (nav, CTA) trên landing chỉ gọi
// /auth/me MỘT lần. Reset khi tải lại trang (full navigation).
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

function checkSession(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  // fetch THÔ (không qua api client) để 401 KHÔNG kích hoạt redirect /login —
  // landing là trang public.
  inflight ??= fetch(`${API_URL}/auth/me`, { credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .then((ok) => {
      cached = ok;
      inflight = null;
      return ok;
    });
  return inflight;
}

/** null = đang kiểm tra; true/false = trạng thái đăng nhập (cho CTA landing). */
export function useSessionFlag(): boolean | null {
  const [authed, setAuthed] = useState<boolean | null>(cached);

  useEffect(() => {
    let active = true;
    void checkSession().then((ok) => {
      if (active) setAuthed(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  return authed;
}
