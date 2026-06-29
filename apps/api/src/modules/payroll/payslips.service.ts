import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  payslipBreakdownLineSchema,
  type CursorPaginated,
  type ListPayslipsQuery,
  type PayslipBreakdownLine,
  type PayslipResponse,
} from '@repo/shared';
import { z } from 'zod';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PayslipPdfService } from './payslip-pdf.service';

const INCLUDE = {
  employee: { select: { fullName: true } },
  run: { select: { month: true } },
} as const;

type PayslipRow = Prisma.PayslipGetPayload<{ include: typeof INCLUDE }>;

const breakdownSchema = z.array(payslipBreakdownLineSchema);

function parseBreakdown(json: Prisma.JsonValue | null): PayslipBreakdownLine[] {
  const parsed = breakdownSchema.safeParse(json);
  return parsed.success ? parsed.data : [];
}

function toResponse(p: PayslipRow): PayslipResponse {
  return {
    id: p.id,
    runId: p.runId,
    month: p.run?.month ?? null,
    employeeId: p.employeeId,
    employeeName: p.employee?.fullName ?? null,
    workdays: p.workdays,
    otMinutes: p.otMinutes,
    baseSalary: p.baseSalary,
    grossEarnings: p.grossEarnings,
    taxableIncome: p.taxableIncome,
    insuranceBase: p.insuranceBase,
    bhxh: p.bhxh,
    bhyt: p.bhyt,
    bhtn: p.bhtn,
    insuranceTotal: p.insuranceTotal,
    pit: p.pit,
    otherDeductions: p.otherDeductions,
    netPay: p.netPay,
    breakdown: parseBreakdown(p.breakdownJson),
    createdAt: p.createdAt.toISOString(),
  };
}

/** Phiếu lương: HR xem theo kỳ/NV; NV xem của mình (mine). */
@Injectable()
export class PayslipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PayslipPdfService,
  ) {}

  /** HR: theo kỳ / NV. Gọi từ route cần payroll:read. */
  async list(
    orgId: string,
    query: ListPayslipsQuery,
  ): Promise<CursorPaginated<PayslipResponse>> {
    const where: Prisma.PayslipWhereInput = {
      orgId,
      ...(query.runId ? { runId: query.runId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    };
    return this.paginate(where, query);
  }

  /** Self: phiếu lương của chính mình — chỉ kỳ đã APPROVED/PAID. */
  async listMine(
    orgId: string,
    actor: AccessTokenPayload,
    query: ListPayslipsQuery,
  ): Promise<CursorPaginated<PayslipResponse>> {
    const me = await this.prisma.employee.findFirst({
      where: { userId: actor.sub, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!me) return { items: [], nextCursor: null };
    const where: Prisma.PayslipWhereInput = {
      orgId,
      employeeId: me.id,
      run: { is: { status: { in: ['APPROVED', 'PAID'] } } },
    };
    return this.paginate(where, query);
  }

  async getMine(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
  ): Promise<PayslipResponse> {
    const me = await this.prisma.employee.findFirst({
      where: { userId: actor.sub, orgId, deletedAt: null },
      select: { id: true },
    });
    const p = await this.prisma.payslip.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!p || !me || p.employeeId !== me.id) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy phiếu lương',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return toResponse(p);
  }

  /** HR: 1 phiếu lương bất kỳ trong org. */
  async get(orgId: string, id: string): Promise<PayslipResponse> {
    const p = await this.prisma.payslip.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!p) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy phiếu lương',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return toResponse(p);
  }

  /** HR: xuất PDF 1 phiếu lương bất kỳ trong org. */
  async renderPdf(
    orgId: string,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    return this.buildPdf(orgId, await this.get(orgId, id));
  }

  /** Self: xuất PDF phiếu lương của chính mình (kỳ đã duyệt/chi). */
  async renderMinePdf(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    return this.buildPdf(orgId, await this.getMine(orgId, actor, id));
  }

  private async buildPdf(
    orgId: string,
    payslip: PayslipResponse,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    const buffer = await this.pdf.render(payslip, { orgName: org?.name ?? null });
    // Tên file ASCII-an toàn cho header Content-Disposition.
    const filename = `phieu-luong-${payslip.month ?? 'ky'}-${payslip.id.slice(0, 8)}.pdf`;
    return { buffer, filename };
  }

  private async paginate(
    where: Prisma.PayslipWhereInput,
    query: ListPayslipsQuery,
  ): Promise<CursorPaginated<PayslipResponse>> {
    const rows = await this.prisma.payslip.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: items.map(toResponse),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }
}
