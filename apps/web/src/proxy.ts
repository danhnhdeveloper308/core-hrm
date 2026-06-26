import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next 16: proxy.ts thay thế middleware.ts (chạy trên Node runtime).
 * - Chặn /dashboard/** khi không có access_token còn hạn → /login?next=...
 * - Đã đăng nhập mà vào trang auth → /dashboard.
 *
 * Cookie chỉ được decode (exp) chứ không verify chữ ký — đây là lớp chặn
 * nhanh chống loop/flash, quyền thật do API + PermissionGate quyết định.
 * Token rác (hết hạn, app khác để lại trên localhost) bị xoá ngay để
 * không gây vòng lặp redirect /login ↔ /dashboard.
 *
 * QUAN TRỌNG (deploy KHÁC domain — FE Vercel + BE Render/Railway): cookie
 * `access_token` thuộc domain API (vd onrender.com), KHÔNG bao giờ gửi tới
 * domain FE (vercel.app) → middleware ở đây ĐỌC KHÔNG RA, gate luôn coi là
 * "chưa đăng nhập" và đá về /login (kẹt vòng lặp dù đăng nhập thành công).
 * Vì vậy: API khác host với FE → BỎ gate ở edge, để client guard
 * (`dashboard/layout` hydrate `/auth/me`, login page tự điều hướng) lo.
 * Cùng host (dev localhost hoặc dùng rewrite proxy) → vẫn gate nhanh như cũ.
 */
const AUTH_PAGES = [
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
];

/**
 * API có khác HOSTNAME với FE không → cookie auth không đọc được ở edge.
 * So theo hostname (BỎ port): cookie không phân biệt port nên dev
 * localhost:3000 ↔ localhost:8001 KHÔNG phải cross-domain (gate vẫn chạy).
 */
function apiIsCrossDomain(request: NextRequest): boolean {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return false;
  try {
    return new URL(apiUrl).hostname !== request.nextUrl.hostname;
  } catch {
    return false;
  }
}

/** Decode payload JWT và kiểm tra exp — không verify chữ ký (không có secret ở web). */
function isTokenUsable(token: string | undefined): boolean {
  if (!token) return false;
  const payload = token.split('.')[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { exp?: number };
    // chừa 5s lệch đồng hồ
    return typeof claims.exp === 'number' && claims.exp * 1_000 > Date.now() + 5_000;
  } catch {
    return false;
  }
}

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // FE và API khác domain → không đọc được cookie auth ở edge. Bỏ qua gate,
  // để client guard quyết định (tránh đá về /login dù đã đăng nhập).
  if (apiIsCrossDomain(request)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('access_token')?.value;
  const isAuthenticated = isTokenUsable(token);

  const isProtected =
    pathname.startsWith('/dashboard') || pathname.startsWith('/checkin');
  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname + search);
    const response = NextResponse.redirect(loginUrl);
    // Cookie tồn tại nhưng không dùng được → xoá để tránh loop
    if (token) response.cookies.delete('access_token');
    return response;
  }

  if (isAuthenticated && AUTH_PAGES.some((page) => pathname === page)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/checkin',
    '/login',
    '/register',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
  ],
};
