'use client';

import type { MeResponse } from '@repo/shared';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001/api';

// Cache + dedupe ở module-scope: nhiều island trên landing chỉ gọi /auth/me MỘT
// lần. Reset khi tải lại trang (full navigation) hoặc gọi resetSession().
let cache: { user: MeResponse | null } | null = null;
let inflight: Promise<MeResponse | null> | null = null;

function load(): Promise<MeResponse | null> {
  if (cache) return Promise.resolve(cache.user);
  // fetch THÔ (không qua api client) để 401 KHÔNG kích hoạt redirect /login —
  // landing là trang public.
  inflight ??= fetch(`${API_URL}/auth/me`, { credentials: 'include' })
    .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : null))
    .catch(() => null)
    .then((user) => {
      cache = { user };
      inflight = null;
      return user;
    });
  return inflight;
}

/** Xoá cache (gọi sau logout để header landing cập nhật khi reload). */
export function resetSession(): void {
  cache = null;
  inflight = null;
}

export interface SessionState {
  loading: boolean;
  user: MeResponse | null;
}

/** Trạng thái phiên cho landing (user = null khi chưa đăng nhập). */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(
    cache ? { loading: false, user: cache.user } : { loading: true, user: null },
  );

  useEffect(() => {
    let active = true;
    void load().then((user) => {
      if (active) setState({ loading: false, user });
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
