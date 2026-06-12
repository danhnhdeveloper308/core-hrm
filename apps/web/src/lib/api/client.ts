import type { ApiErrorBody, ApiResponse } from '@repo/shared';
import type { ZodType } from 'zod';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const DEFAULT_TIMEOUT_MS = 15_000;

/** Lỗi chuẩn từ API — FE bắt theo errorCode thay vì so sánh message. */
export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly details?: unknown;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = body.statusCode;
    this.errorCode = body.errorCode;
    this.details = body.details;
  }
}

/**
 * Các endpoint auth public — 401 ở đây là kết quả nghiệp vụ (sai mật khẩu,
 * token hết hạn...), KHÔNG kích hoạt auto-refresh.
 */
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/verify-email',
  '/auth/resend-otp',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/2fa/verify',
  '/auth/2fa/recovery',
];

type UnauthorizedHandler = () => void;

let unauthorizedInFlight = false;

/**
 * 401 không cứu được: gọi /auth/logout để server XOÁ cookie (kể cả cookie
 * rác/hết hạn) rồi mới redirect — nếu không proxy.ts sẽ thấy cookie còn đó
 * và bounce ngược về /dashboard gây vòng lặp redirect vô hạn.
 */
export async function forceLogoutRedirect(): Promise<void> {
  if (typeof window === 'undefined' || unauthorizedInFlight) return;
  unauthorizedInFlight = true;
  try {
    await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => undefined);
  } finally {
    if (!window.location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(
        window.location.pathname + window.location.search,
      );
      window.location.href = `/login?next=${next}`;
      // giữ unauthorizedInFlight = true — trang sắp unload, chặn mọi lần gọi lại
    } else {
      unauthorizedInFlight = false;
    }
  }
}

let onUnauthorized: UnauthorizedHandler = () => {
  void forceLogoutRedirect();
};

/** Auth store đăng ký handler để clear state trước khi redirect. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

// ---- Auto-refresh single-flight: mọi request 401 đồng thời cùng await 1 promise ----

let refreshPromise: Promise<boolean> | null = null;
let lastRefreshFailureAt = 0;
const REFRESH_FAILURE_COOLDOWN_MS = 10_000;

/** Gọi sau khi login thành công — cho phép refresh lại ngay. */
export function resetRefreshCooldown(): void {
  lastRefreshFailureAt = 0;
}

function refreshOnce(): Promise<boolean> {
  // Vừa refresh fail xong thì các request sau fail nhanh — không spam API
  if (Date.now() - lastRefreshFailureAt < REFRESH_FAILURE_COOLDOWN_MS) {
    return Promise.resolve(false);
  }
  refreshPromise ??= fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((res) => {
      lastRefreshFailureAt = res.ok ? 0 : Date.now();
      return res.ok;
    })
    .catch(() => {
      lastRefreshFailureAt = Date.now();
      return false;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

async function parseErrorBody(res: Response): Promise<ApiErrorBody> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    return {
      statusCode: body.statusCode ?? res.status,
      message: body.message ?? res.statusText,
      errorCode: body.errorCode ?? `HTTP_${res.status}`,
      details: body.details,
    };
  } catch {
    return {
      statusCode: res.status,
      message: res.statusText || 'Lỗi không xác định',
      errorCode: `HTTP_${res.status}`,
    };
  }
}

export interface ApiFetchOptions<T> extends Omit<RequestInit, 'body' | 'signal'> {
  /** Tự JSON.stringify — truyền object thẳng. */
  body?: unknown;
  timeoutMs?: number;
  /** Parse + validate response bằng zod khi cần đảm bảo shape. */
  schema?: ZodType<T>;
  /** Tắt auto-refresh cho request này. */
  skipRefresh?: boolean;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions<T> = {},
): Promise<T> {
  const {
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    schema,
    skipRefresh,
    headers,
    ...init
  } = options;

  const execute = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${BASE_URL}${path}`, {
        ...init,
        credentials: 'include',
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await execute();

  const refreshable =
    !skipRefresh && !NO_REFRESH_PATHS.some((p) => path.startsWith(p));

  if (res.status === 401 && refreshable) {
    const refreshed = await refreshOnce();
    if (!refreshed) {
      onUnauthorized();
      throw new ApiError(await parseErrorBody(res));
    }
    // refresh thành công → retry request gốc đúng 1 lần
    res = await execute();
    if (res.status === 401) onUnauthorized();
  }

  if (!res.ok) {
    throw new ApiError(await parseErrorBody(res));
  }

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json();
  return schema ? schema.parse(data) : (data as T);
}

/** Biến thể không throw — tiện cho Server Components. */
export async function apiFetchSafe<T>(
  path: string,
  options: ApiFetchOptions<T> = {},
): Promise<ApiResponse<T>> {
  try {
    return { success: true, data: await apiFetch<T>(path, options) };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: {
          statusCode: error.status,
          message: error.message,
          errorCode: error.errorCode,
          details: error.details,
        },
      };
    }
    return {
      success: false,
      error: {
        statusCode: 0,
        message: error instanceof Error ? error.message : 'Lỗi mạng',
        errorCode: 'NETWORK_ERROR',
      },
    };
  }
}

/** Helper typed theo method — dùng các hàm này thay vì gọi apiFetch trực tiếp. */
export const api = {
  get: <T>(path: string, options?: ApiFetchOptions<T>) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: ApiFetchOptions<T>) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: ApiFetchOptions<T>) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: ApiFetchOptions<T>) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: ApiFetchOptions<T>) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};
