import type { Allowances, ContractListItem, ContractResponse } from '@repo/shared';
import type { Prisma } from '../../generated/prisma/client';
import type { EmploymentContract } from '../../prisma/prisma.types';

/** Parse allowanceJson (Prisma.JsonValue) → { tên: số tiền }. Bỏ giá trị không phải số. */
export function toAllowances(json: Prisma.JsonValue | null): Allowances | null {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(json)) {
      if (typeof v === 'number') out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  return null;
}

function dateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function toContractResponse(c: EmploymentContract): ContractResponse {
  return {
    id: c.id,
    employeeId: c.employeeId,
    code: c.code,
    type: c.type,
    status: c.status,
    startDate: dateOnly(c.startDate) ?? '',
    endDate: dateOnly(c.endDate),
    signedDate: dateOnly(c.signedDate),
    baseSalary: c.baseSalary,
    allowances: toAllowances(c.allowanceJson),
    parentId: c.parentId,
    terminateDate: dateOnly(c.terminateDate),
    terminateReason: c.terminateReason,
    hasFile: c.fileKey !== null,
    note: c.note,
    createdAt: c.createdAt.toISOString(),
  };
}

type ContractWithEmployee = Prisma.EmploymentContractGetPayload<{
  include: {
    employee: {
      select: { code: true; fullName: true; orgUnit: { select: { name: true } } };
    };
  };
}>;

export function toContractListItem(c: ContractWithEmployee): ContractListItem {
  return {
    ...toContractResponse(c),
    employeeName: c.employee.fullName,
    employeeCode: c.employee.code,
    orgUnitName: c.employee.orgUnit?.name ?? null,
  };
}
