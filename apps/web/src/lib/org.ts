import type { OrgUnitResponse } from '@repo/shared';

/**
 * Nhãn breadcrumb đầy đủ theo cây cho 1 đơn vị, vd:
 * "Tổ hợp Túi xách Thoại Sơn › Hành Chính - Quản trị".
 * Trong tập đoàn cùng tên phòng ban lặp ở nhiều nhánh nên cần ngữ cảnh cha.
 */
export function orgUnitBreadcrumb(
  unit: OrgUnitResponse,
  byId: Map<string, OrgUnitResponse>,
): string {
  const names: string[] = [];
  let current: OrgUnitResponse | undefined = unit;
  let guard = 0;
  while (current && guard++ < 32) {
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(' › ');
}

/** Sắp xếp đơn vị theo path (đúng thứ tự cây) + kèm nhãn breadcrumb. */
export function orgUnitOptions(
  units: OrgUnitResponse[],
): { id: string; label: string }[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  return units
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((u) => ({ id: u.id, label: orgUnitBreadcrumb(u, byId) }));
}
