import type { CookieOptions, Response } from 'express';

export const ACCESS_COOKIE = 'emc_at';
export const REFRESH_COOKIE = 'emc_rt';
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface CookieSettings {
  secure: boolean;
  domain?: string;
}

function base(settings: CookieSettings): CookieOptions {
  return {
    httpOnly: true,
    secure: settings.secure,
    sameSite: 'lax',
    domain: settings.domain,
  };
}

export function setAuthCookies(res: Response, settings: CookieSettings, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, { ...base(settings), path: '/', maxAge: ACCESS_TTL_SECONDS * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base(settings), path: '/auth', maxAge: REFRESH_TTL_SECONDS * 1000 });
}

export function clearAuthCookies(res: Response, settings: CookieSettings): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(settings), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base(settings), path: '/auth' });
}
