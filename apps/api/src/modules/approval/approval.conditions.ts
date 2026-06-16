/** Khớp điều kiện flow với ngữ cảnh đơn — thuần, dễ test (spec 2.8). */

export type ConditionContext = Record<string, string | number | boolean | null>;

type Operators = {
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  eq?: string | number | boolean;
  in?: (string | number)[];
};

/**
 * conditions dạng { field: value } (bằng) hoặc { field: { gt/gte/lt/lte/eq/in } }.
 * null/{} = match tất cả (flow mặc định). Mọi field phải thỏa (AND).
 */
export function matchConditions(
  conditions: unknown,
  ctx: ConditionContext,
): boolean {
  if (conditions == null || typeof conditions !== 'object') return true;
  const entries = Object.entries(conditions as Record<string, unknown>);
  if (entries.length === 0) return true;

  return entries.every(([field, rule]) => {
    const value = ctx[field];
    if (rule !== null && typeof rule === 'object' && !Array.isArray(rule)) {
      const op = rule as Operators;
      if (op.gt !== undefined && !(typeof value === 'number' && value > op.gt)) return false;
      if (op.gte !== undefined && !(typeof value === 'number' && value >= op.gte)) return false;
      if (op.lt !== undefined && !(typeof value === 'number' && value < op.lt)) return false;
      if (op.lte !== undefined && !(typeof value === 'number' && value <= op.lte)) return false;
      if (op.eq !== undefined && value !== op.eq) return false;
      if (op.in !== undefined && !op.in.includes(value as string | number)) return false;
      return true;
    }
    // So sánh bằng trực tiếp
    return value === rule;
  });
}

/**
 * Chọn flow: trong các flow active cùng targetType, lấy flow priority cao nhất
 * có conditions match ngữ cảnh. Không có flow match → null.
 */
export function selectFlow<T extends { priority: number; conditions: unknown }>(
  flows: T[],
  ctx: ConditionContext,
): T | null {
  const matched = flows
    .filter((f) => matchConditions(f.conditions, ctx))
    .sort((a, b) => b.priority - a.priority);
  return matched[0] ?? null;
}
