'use client';

import type { OrgUnitResponse } from '@repo/shared';
import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const NONE = '__none__';

interface OrgUnitCascaderProps {
  /** Toàn bộ đơn vị (phẳng) trong org. */
  units: OrgUnitResponse[];
  /** Id đơn vị đang chọn (đơn vị SÂU NHẤT trong chuỗi). null = chưa chọn. */
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  /** Nhãn khi chưa chọn ở 1 cấp. */
  placeholder?: string;
  className?: string;
}

/**
 * Chọn đơn vị theo cây từ CẤP CAO NHẤT → CẤP THẤP NHẤT (cascader).
 *
 * Mỗi cấp là 1 ô select chỉ chứa các đơn vị con của cấp trên đã chọn. Khi chọn
 * 1 cấp, ô select cho cấp con kế tiếp tự hiện (nếu cấp đó còn con). `value` luôn
 * là đơn vị sâu nhất đang chọn; toàn bộ UI suy ra từ chuỗi tổ tiên của `value`
 * nên component không giữ state riêng (controlled hoàn toàn).
 *
 * Ví dụ: Tập đoàn TBS → Ngành túi xách → Chuỗi túi xách → Tổ hợp Thoại Sơn →
 * Phòng Hành chính - Quản trị. Tránh dropdown phẳng khổng lồ ở quy mô tập đoàn.
 */
export function OrgUnitCascader({
  units,
  value,
  onChange,
  disabled,
  placeholder = '— Chọn —',
  className,
}: OrgUnitCascaderProps) {
  const byId = useMemo(
    () => new Map(units.map((u) => [u.id, u])),
    [units],
  );

  // Con trực tiếp theo parentId (null = node gốc). Parent không tồn tại trong
  // danh sách (đã lọc) ⇒ coi như gốc để không mất node.
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, OrgUnitResponse[]>();
    for (const u of units) {
      const key = u.parentId && byId.has(u.parentId) ? u.parentId : null;
      const arr = m.get(key);
      if (arr) arr.push(u);
      else m.set(key, [u]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return m;
  }, [units, byId]);

  // Chuỗi tổ tiên của value: [gốc … value].
  const chain = useMemo(() => {
    const result: OrgUnitResponse[] = [];
    let cur = value ? byId.get(value) : undefined;
    let guard = 0;
    while (cur && guard++ < 32) {
      result.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return result;
  }, [value, byId]);

  // Mỗi cấp = 1 select; parentIds[i] là cha của các lựa chọn ở cấp i. Luôn có
  // cấp gốc (null); thêm 1 cấp con cho mỗi node đã chọn mà còn con (để drill sâu).
  const parentIds: (string | null)[] = [null];
  for (const node of chain) {
    if ((childrenOf.get(node.id)?.length ?? 0) > 0) parentIds.push(node.id);
  }

  const levelLabel = (options: OrgUnitResponse[], i: number) => {
    const types = new Set(options.map((o) => o.typeName));
    return types.size === 1 ? [...types][0]! : `Cấp ${i + 1}`;
  };

  return (
    <div className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2', className)}>
      {parentIds.map((parentId, i) => {
        const options = childrenOf.get(parentId) ?? [];
        if (options.length === 0) return null;
        const selected = chain[i]?.id ?? NONE;
        return (
          <div key={parentId ?? '__root__'} className="space-y-1">
            <span className="text-xs text-muted-foreground">{levelLabel(options, i)}</span>
            <Select
              value={selected}
              disabled={disabled}
              // Bỏ chọn ở cấp i ⇒ lùi value về cha của cấp đó (null nếu là gốc).
              onValueChange={(v) => onChange(v === NONE ? parentId : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{placeholder}</SelectItem>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                    {o.code ? ` · ${o.code}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
