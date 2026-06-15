import type { CookieOptions, Response } from 'express';
import type { AppConfigService } from '../../config/app-config.service';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
/** Token "tin cậy thiết bị" — sống 30 ngày, chỉ gửi tới /api/auth/*. */
export const TRUSTED_DEVICE_COOKIE = 'trusted_device';

const TRUSTED_DEVICE_TTL_MS = 30 * 86_400_000;

function baseCookieOptions(config: AppConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };
}

function refreshCookiePath(config: AppConfigService): string {
  // refresh token chỉ gửi kèm các request /api/auth/* — giảm bề mặt lộ token
  return `/${config.globalPrefix}/auth`;
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  config: AppConfigService,
): void {
  const base = baseCookieOptions(config);
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...base,
    path: '/',
    maxAge: config.accessTokenTtlMs,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...base,
    path: refreshCookiePath(config),
    maxAge: config.refreshTokenTtlMs,
  });
}

export function setTrustedDeviceCookie(
  res: Response,
  token: string,
  config: AppConfigService,
): void {
  res.cookie(TRUSTED_DEVICE_COOKIE, token, {
    ...baseCookieOptions(config),
    path: refreshCookiePath(config),
    maxAge: TRUSTED_DEVICE_TTL_MS,
  });
}

/** KHÔNG xoá trusted_device khi logout — đó là chủ đích của "ghi nhớ thiết bị". */
export function clearAuthCookies(res: Response, config: AppConfigService): void {
  const base = baseCookieOptions(config);
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    ...base,
    path: refreshCookiePath(config),
  });
}
