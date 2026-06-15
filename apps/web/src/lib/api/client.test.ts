/**
 * Unit test fetch wrapper: auto-refresh 401 single-flight.
 * Module có state (refreshPromise, cooldown) → resetModules + dynamic import
 * cho mỗi test để cô lập.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ClientModule = typeof import('./client');

const BASE = 'http://localhost:3001/api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ok = (body: unknown) => jsonResponse(200, body);
const unauthorized = () =>
  jsonResponse(401, {
    statusCode: 401,
    message: 'Chưa đăng nhập',
    errorCode: 'AUTH_UNAUTHENTICATED',
  });

async function loadClient(): Promise<ClientModule> {
  vi.resetModules();
  return import('./client');
}

describe('apiFetch — auto refresh single-flight', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('trả data khi response ok', async () => {
    const { api } = await loadClient();
    fetchMock.mockResolvedValueOnce(ok({ hello: 'world' }));

    await expect(api.get('/users')).resolves.toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/users`);
    expect((init as RequestInit).credentials).toBe('include');
  });

  it('401 → gọi /auth/refresh → retry request gốc đúng 1 lần', async () => {
    const { api } = await loadClient();
    fetchMock
      .mockResolvedValueOnce(unauthorized()) // request gốc
      .mockResolvedValueOnce(ok({ message: 'ok' })) // refresh
      .mockResolvedValueOnce(ok({ id: 1 })); // retry

    await expect(api.get('/users')).resolves.toEqual({ id: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]![0]).toBe(`${BASE}/auth/refresh`);
    expect(fetchMock.mock.calls[2]![0]).toBe(`${BASE}/users`);
  });

  it('nhiều request 401 đồng thời chỉ refresh 1 lần (single-flight)', async () => {
    const { api } = await loadClient();

    let refreshCalls = 0;
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        // refresh chậm để 2 request cùng chờ
        return new Promise((resolve) =>
          setTimeout(() => resolve(ok({ message: 'ok' })), 20),
        );
      }
      // lần đầu 401, sau refresh thì 200
      return Promise.resolve(
        refreshCalls === 0 ? unauthorized() : ok({ data: url }),
      );
    });

    const [a, b] = await Promise.all([
      api.get<{ data: string }>('/users'),
      api.get<{ data: string }>('/roles'),
    ]);

    expect(refreshCalls).toBe(1);
    expect(a.data).toContain('/users');
    expect(b.data).toContain('/roles');
  });

  it('refresh thất bại → gọi unauthorized handler + throw ApiError', async () => {
    const { api, setUnauthorizedHandler, ApiError } = await loadClient();
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    fetchMock
      .mockResolvedValueOnce(unauthorized()) // request gốc
      .mockResolvedValueOnce(unauthorized()); // refresh fail

    await expect(api.get('/users')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    // không retry request gốc khi refresh fail
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sau khi refresh fail, request kế tiếp fail nhanh (cooldown) — resetRefreshCooldown mở lại', async () => {
    const { api, setUnauthorizedHandler, resetRefreshCooldown } =
      await loadClient();
    setUnauthorizedHandler(() => undefined);

    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(unauthorized()); // refresh fail → bật cooldown

    await expect(api.get('/users')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Trong cooldown: 401 mới KHÔNG gọi refresh nữa
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(api.get('/roles')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // không có call refresh thêm

    // Login thành công → reset cooldown → refresh hoạt động lại
    resetRefreshCooldown();
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(ok({ message: 'ok' }))
      .mockResolvedValueOnce(ok({ id: 2 }));
    await expect(api.get('/users')).resolves.toEqual({ id: 2 });
  });

  it('endpoint auth public (login) 401 → KHÔNG refresh, throw thẳng', async () => {
    const { api, ApiError } = await loadClient();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        statusCode: 401,
        message: 'Sai mật khẩu',
        errorCode: 'AUTH_INVALID_CREDENTIALS',
      }),
    );

    await expect(
      api.post('/auth/login', { email: 'a@b.com', password: 'x' }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lỗi 4xx parse thành ApiError đầy đủ errorCode/details', async () => {
    const { api } = await loadClient();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        statusCode: 400,
        message: 'Dữ liệu không hợp lệ',
        errorCode: 'VALIDATION_ERROR',
        details: [{ path: 'email' }],
      }),
    );

    const error = await api.post('/users', {}).catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 400,
      errorCode: 'VALIDATION_ERROR',
      details: [{ path: 'email' }],
    });
  });

  it('body object được JSON.stringify + set content-type', async () => {
    const { api } = await loadClient();
    fetchMock.mockResolvedValueOnce(ok({}));

    await api.post('/auth/login', { email: 'a@b.com' });
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).body).toBe('{"email":"a@b.com"}');
    expect(
      ((init as RequestInit).headers as Record<string, string>)['content-type'],
    ).toBe('application/json');
  });
});
