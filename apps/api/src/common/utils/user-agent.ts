import { sha256 } from './crypto';

interface ParsedUserAgent {
  browser: string;
  os: string;
  /** Tên thân thiện, vd "Chrome on macOS". */
  deviceName: string;
  /** Hash ua+platform — nhận diện lại thiết bị giữa các session. */
  fingerprint: string;
}

function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\//i.test(ua)) return 'Opera';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  if (/postman/i.test(ua)) return 'Postman';
  return 'Trình duyệt khác';
}

function detectOs(ua: string): string {
  if (/windows/i.test(ua)) return 'Windows';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ios/i.test(ua)) return 'iOS';
  if (/mac os|macintosh/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'OS khác';
}

export function parseUserAgent(userAgent: string | undefined): ParsedUserAgent {
  const ua = userAgent ?? 'unknown';
  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  return {
    browser,
    os,
    deviceName: `${browser} on ${os}`,
    fingerprint: sha256(`${ua}|${os}`),
  };
}
