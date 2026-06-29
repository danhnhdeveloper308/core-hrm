'use client';

import type { PayslipResponse } from '@repo/shared';

const money = (v: number): string => new Intl.NumberFormat('vi-VN').format(v) + '₫';

/** Bảng chi tiết 1 phiếu lương: thu nhập − khấu trừ = thực lĩnh. */
export function PayslipBreakdown({ p }: { p: PayslipResponse }) {
  const earnings = p.breakdown.filter((l) => l.kind === 'EARNING');
  const deductions = p.breakdown.filter((l) => l.kind === 'DEDUCTION');

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
        <span>Tháng: {p.month ?? '—'}</span>
        <span>Công: {p.workdays ?? 0} ngày</span>
        <span>OT: {Math.round((p.otMinutes / 60) * 10) / 10} giờ</span>
        <span>TN tính thuế: {money(p.taxableIncome)}</span>
      </div>

      <div>
        <div className="mb-1 font-medium text-green-600 dark:text-green-400">
          Thu nhập
        </div>
        <ul className="space-y-1">
          {earnings.map((l, i) => (
            <li key={i} className="flex justify-between">
              <span className="text-muted-foreground">{l.label}</span>
              <span className="tabular-nums">{money(l.amount)}</span>
            </li>
          ))}
          <li className="flex justify-between border-t pt-1 font-medium">
            <span>Tổng thu nhập</span>
            <span className="tabular-nums">{money(p.grossEarnings)}</span>
          </li>
        </ul>
      </div>

      <div>
        <div className="mb-1 font-medium text-red-600 dark:text-red-400">
          Khấu trừ
        </div>
        <ul className="space-y-1">
          {deductions.map((l, i) => (
            <li key={i} className="flex justify-between">
              <span className="text-muted-foreground">{l.label}</span>
              <span className="tabular-nums">−{money(l.amount)}</span>
            </li>
          ))}
          <li className="flex justify-between border-t pt-1 font-medium">
            <span>Tổng khấu trừ</span>
            <span className="tabular-nums">
              −{money(p.insuranceTotal + p.pit + p.otherDeductions)}
            </span>
          </li>
        </ul>
      </div>

      <div className="flex justify-between rounded-md bg-primary/10 p-3 text-base font-semibold text-primary">
        <span>Thực lĩnh</span>
        <span className="tabular-nums">{money(p.netPay)}</span>
      </div>
    </div>
  );
}
