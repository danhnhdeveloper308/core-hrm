const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parse "15m" / "30d" → milliseconds. Env đã được zod validate đúng format. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    throw new Error(`Thời lượng không hợp lệ: "${value}" (format: <số><s|m|h|d>)`);
  }
  return Number(match[1]) * (UNIT_MS[match[2] as string] ?? 0);
}
