'use client';

import {
  PERMISSIONS,
  type PayrollConfigResponse,
  type PitBracketInput,
  type UpdatePayrollConfigInput,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { useAuthStore } from '@/stores/auth-store';

interface ConfigForm {
  personalDeduction: string;
  dependentDeduction: string;
  baseSalaryGov: string;
  regionMinWage: string;
  bhxhPct: string;
  bhytPct: string;
  bhtnPct: string;
  brackets: { upTo: string; ratePct: string }[];
}

function toForm(c: PayrollConfigResponse): ConfigForm {
  return {
    personalDeduction: String(c.personalDeduction),
    dependentDeduction: String(c.dependentDeduction),
    baseSalaryGov: String(c.baseSalaryGov),
    regionMinWage: String(c.regionMinWage),
    bhxhPct: String(c.bhxhRateBps / 100),
    bhytPct: String(c.bhytRateBps / 100),
    bhtnPct: String(c.bhtnRateBps / 100),
    brackets: c.pitBrackets.map((b) => ({
      upTo: b.upTo !== null ? String(b.upTo) : '',
      ratePct: String(b.rateBps / 100),
    })),
  };
}

export function ConfigTab() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.payroll.config,
    queryFn: () => api.get<PayrollConfigResponse>('/payroll/config'),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-72 w-full" />;
  }
  // key theo updatedAt → form re-init khi config đổi (sau khi lưu).
  return <ConfigForm key={data.updatedAt} initial={data} />;
}

function ConfigForm({ initial }: { initial: PayrollConfigResponse }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage =
    user?.permissions.includes(PERMISSIONS.PAYROLL_MANAGE) ?? false;
  const [form, setForm] = useState<ConfigForm>(() => toForm(initial));

  const saveMutation = useMutation({
    mutationFn: (f: ConfigForm) => {
      const brackets: PitBracketInput[] = f.brackets.map((b) => ({
        upTo: b.upTo.trim() === '' ? null : Number(b.upTo),
        rateBps: Math.round(Number(b.ratePct) * 100),
      }));
      const body: UpdatePayrollConfigInput = {
        personalDeduction: Number(f.personalDeduction),
        dependentDeduction: Number(f.dependentDeduction),
        baseSalaryGov: Number(f.baseSalaryGov),
        regionMinWage: Number(f.regionMinWage),
        bhxhRateBps: Math.round(Number(f.bhxhPct) * 100),
        bhytRateBps: Math.round(Number(f.bhytPct) * 100),
        bhtnRateBps: Math.round(Number(f.bhtnPct) * 100),
        pitBrackets: brackets,
      };
      return api.patch<PayrollConfigResponse>('/payroll/config', body);
    },
    onSuccess: () => {
      // invalidate → refetch → ConfigForm re-mount theo key updatedAt (form reset).
      void qc.invalidateQueries({ queryKey: queryKeys.payroll.config });
      toast.success('Đã lưu cấu hình lương');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });

  const num = (k: keyof ConfigForm, label: string, suffix?: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          disabled={!canManage}
          value={form[k] as string}
          onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        />
        {suffix ? (
          <span className="text-sm text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Giảm trừ & bảo hiểm</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {num('personalDeduction', 'Giảm trừ bản thân/tháng', '₫')}
          {num('dependentDeduction', 'Giảm trừ người phụ thuộc', '₫')}
          {num('baseSalaryGov', 'Lương cơ sở (trần BHXH/BHYT ×20)', '₫')}
          {num('regionMinWage', 'Lương tối thiểu vùng (trần BHTN ×20)', '₫')}
          {num('bhxhPct', 'BHXH (phần NV)', '%')}
          {num('bhytPct', 'BHYT (phần NV)', '%')}
          {num('bhtnPct', 'BHTN (phần NV)', '%')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Biểu thuế TNCN (luỹ tiến từng phần)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {form.brackets.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-12 text-sm text-muted-foreground">
                Bậc {i + 1}
              </span>
              <Input
                type="number"
                min={0}
                disabled={!canManage}
                placeholder="Đến mức (₫) — trống = trên cùng"
                value={b.upTo}
                onChange={(e) => {
                  const brackets = [...form.brackets];
                  brackets[i] = { ...brackets[i]!, upTo: e.target.value };
                  setForm({ ...form, brackets });
                }}
              />
              <Input
                type="number"
                min={0}
                className="w-24"
                disabled={!canManage}
                value={b.ratePct}
                onChange={(e) => {
                  const brackets = [...form.brackets];
                  brackets[i] = { ...brackets[i]!, ratePct: e.target.value };
                  setForm({ ...form, brackets });
                }}
              />
              <span className="text-sm text-muted-foreground">%</span>
              {canManage ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Xoá bậc"
                  onClick={() =>
                    setForm({
                      ...form,
                      brackets: form.brackets.filter((_, j) => j !== i),
                    })
                  }
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              ) : null}
            </div>
          ))}
          {canManage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setForm({
                  ...form,
                  brackets: [...form.brackets, { upTo: '', ratePct: '0' }],
                })
              }
            >
              <Plus className="size-4" /> Thêm bậc
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {canManage ? (
        <div className="flex justify-end">
          <Button
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate(form)}
          >
            Lưu cấu hình
          </Button>
        </div>
      ) : null}
    </div>
  );
}
