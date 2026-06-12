const SENSITIVE_KEY = /password|token|secret|otp/i;
const MAX_DEPTH = 5;

/**
 * Redact đệ quy các field nhạy cảm (password|token|secret|otp) trước khi
 * ghi audit log — không bao giờ để credentials lọt vào DB/console.
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY.test(key)
        ? '[REDACTED]'
        : redactSensitive(val, depth + 1);
    }
    return result;
  }
  return value;
}
