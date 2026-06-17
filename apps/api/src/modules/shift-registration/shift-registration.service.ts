import { HttpStatus, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ERROR_CODES,
  SHIFT_VARIANT_LABELS,
  type ShiftRegistrationBatchResponse,
  type ShiftVariant,
  type UploadBatchResult,
} from '@repo/shared';
import ExcelJS from 'exceljs';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import {
  APP_EVENTS,
  type ApprovalDecidedEvent,
} from '../../common/events/app.events';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalService } from '../approval/approval.service';
import { TimesheetService } from '../attendance/timesheet.service';

interface ParsedRow {
  rowNum: number;
  code: string;
  date: string;
  variant: ShiftVariant;
  reason: string | null;
}

/** Bỏ dấu + lowercase để nhận diện loại ca từ text tiếng Việt/mã. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function parseVariant(raw: string): ShiftVariant | null {
  const n = normalize(raw);
  if (!n) return null;
  if (n.includes('xuong') || n === 'xuong_ca') return 'XUONG_CA';
  if (n.includes('gian') || n === 'gian_ca') return 'GIAN_CA';
  if (n.includes('tang') || n === 'tang_ca') return 'TANG_CA';
  return null;
}

function cellToDate(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // dd/mm/yyyy
    if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  return null;
}

function cellToStr(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in value) return String(value.text).trim();
  return String(value).trim();
}

@Injectable()
export class ShiftRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approval: ApprovalService,
    private readonly timesheet: TimesheetService,
  ) {}

  /** File mẫu Excel để user điền (danh sách phẳng: NV + ngày + loại + lý do). */
  async generateTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('DangKy');
    ws.columns = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'MSNV', key: 'msnv', width: 16 },
      { header: 'HỌ & TÊN (tham khảo)', key: 'name', width: 26 },
      { header: 'NGÀY (YYYY-MM-DD)', key: 'date', width: 20 },
      { header: 'LOẠI (XUONG_CA / GIAN_CA / TANG_CA)', key: 'variant', width: 34 },
      { header: 'LÝ DO', key: 'reason', width: 30 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRow({ stt: 1, msnv: 'NV001', name: 'Nguyễn Văn A', date: '2026-06-17', variant: 'TANG_CA', reason: 'Đẩy SL kịp tiến độ' });
    ws.addRow({ stt: 2, msnv: 'NV002', name: 'Trần Thị B', date: '2026-06-17', variant: 'GIAN_CA', reason: '' });
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * Upload + parse danh sách → tạo phiếu (PENDING) + dòng + luồng duyệt
   * SHIFT_BATCH. Trả số dòng tạo + danh sách dòng lỗi để user sửa file.
   */
  async upload(
    orgId: string,
    actor: AccessTokenPayload,
    title: string,
    file: Buffer,
  ): Promise<UploadBatchResult> {
    const uploader = await this.prisma.employee.findFirst({
      where: { orgId, userId: actor.sub },
      select: { id: true },
    });
    if (!uploader) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Tài khoản tổng hợp chưa gắn hồ sơ nhân viên',
        ERROR_CODES.NOT_FOUND,
      );
    }

    const wb = new ExcelJS.Workbook();
    // @types/node Buffer là generic; exceljs nhận Buffer thường → ép kiểu an toàn
    await wb.xlsx.load(file as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'File rỗng', ERROR_CODES.VALIDATION_ERROR);
    }

    const errors: { row: number; message: string }[] = [];
    const rows: ParsedRow[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // header
      const code = cellToStr(row.getCell(2).value);
      if (!code) return; // dòng trống
      const date = cellToDate(row.getCell(4).value);
      const variant = parseVariant(cellToStr(row.getCell(5).value));
      const reason = cellToStr(row.getCell(6).value) || null;
      if (!date) {
        errors.push({ row: rowNum, message: `MSNV ${code}: ngày không hợp lệ` });
        return;
      }
      if (!variant) {
        errors.push({ row: rowNum, message: `MSNV ${code}: loại ca không hợp lệ` });
        return;
      }
      rows.push({ rowNum, code, date, variant, reason });
    });

    if (rows.length === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        errors[0]?.message ?? 'Không có dòng hợp lệ trong file',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Resolve mã NV → employeeId (1 query)
    const codes = [...new Set(rows.map((r) => r.code))];
    const employees = await this.prisma.employee.findMany({
      where: { orgId, code: { in: codes } },
      select: { id: true, code: true },
    });
    const byCode = new Map(employees.map((e) => [e.code, e.id]));

    const validLines = rows.filter((r) => {
      if (!byCode.has(r.code)) {
        errors.push({ row: r.rowNum, message: `Không tìm thấy nhân viên mã ${r.code}` });
        return false;
      }
      return true;
    });
    if (validLines.length === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Không có nhân viên hợp lệ trong file',
        ERROR_CODES.NOT_FOUND,
      );
    }

    const batch = await this.prisma.shiftRegistrationBatch.create({
      data: {
        orgId,
        title,
        status: 'PENDING',
        uploadedById: actor.sub,
        lines: {
          create: validLines.map((r) => ({
            orgId,
            employeeId: byCode.get(r.code)!,
            date: new Date(r.date),
            variant: r.variant,
            reason: r.reason,
          })),
        },
      },
    });

    const counts = validLines.reduce<Record<string, number>>((acc, r) => {
      acc[r.variant] = (acc[r.variant] ?? 0) + 1;
      return acc;
    }, {});
    const summary = `${title} — ${validLines.length} NV (${Object.entries(counts)
      .map(([v, n]) => `${SHIFT_VARIANT_LABELS[v as ShiftVariant]}: ${n}`)
      .join(', ')})`;

    await this.approval.createInstance(
      orgId,
      'SHIFT_BATCH',
      batch.id,
      uploader.id,
      {},
      summary,
    );

    addAuditMetadata({ after: { title, lines: validLines.length } });
    return { batchId: batch.id, created: validLines.length, errors };
  }

  async list(orgId: string): Promise<ShiftRegistrationBatchResponse[]> {
    const batches = await this.prisma.shiftRegistrationBatch.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { lines: true } } },
    });
    const uploaderIds = batches
      .map((b) => b.uploadedById)
      .filter((v): v is string => !!v);
    const users = uploaderIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: uploaderIds } },
          select: { id: true, name: true },
        })
      : [];
    const userName = new Map(users.map((u) => [u.id, u.name]));
    const instances = await this.prisma.approvalInstance.findMany({
      where: { orgId, targetType: 'SHIFT_BATCH', targetId: { in: batches.map((b) => b.id) } },
      select: { id: true, targetId: true },
    });
    const instByTarget = new Map(instances.map((i) => [i.targetId, i.id]));
    return batches.map((b) => ({
      id: b.id,
      title: b.title,
      status: b.status,
      uploadedByName: b.uploadedById ? (userName.get(b.uploadedById) ?? null) : null,
      approvalInstanceId: instByTarget.get(b.id) ?? null,
      lineCount: b._count.lines,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  async getBatch(orgId: string, id: string): Promise<ShiftRegistrationBatchResponse> {
    const batch = await this.prisma.shiftRegistrationBatch.findFirst({
      where: { id, orgId },
      include: { lines: { include: { employee: { select: { code: true, fullName: true } } } } },
    });
    if (!batch) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Không tìm thấy phiếu', ERROR_CODES.NOT_FOUND);
    }
    const instance = await this.prisma.approvalInstance.findFirst({
      where: { orgId, targetType: 'SHIFT_BATCH', targetId: id },
      select: { id: true },
    });
    const uploader = batch.uploadedById
      ? await this.prisma.user.findUnique({
          where: { id: batch.uploadedById },
          select: { name: true },
        })
      : null;
    return {
      id: batch.id,
      title: batch.title,
      status: batch.status,
      uploadedByName: uploader?.name ?? null,
      approvalInstanceId: instance?.id ?? null,
      lineCount: batch.lines.length,
      createdAt: batch.createdAt.toISOString(),
      lines: batch.lines.map((l) => ({
        id: l.id,
        employeeId: l.employeeId,
        employeeCode: l.employee.code,
        employeeName: l.employee.fullName,
        date: l.date.toISOString(),
        variant: l.variant,
        reason: l.reason,
      })),
    };
  }

  /** Phiếu được duyệt (cấp cao nhất) → áp công cho TẤT CẢ NV trong danh sách. */
  @OnEvent(APP_EVENTS.APPROVAL_DECIDED)
  async onBatchDecided(event: ApprovalDecidedEvent): Promise<void> {
    if (event.targetType !== 'SHIFT_BATCH') return;
    const batch = await this.prisma.shiftRegistrationBatch.findFirst({
      where: { id: event.targetId, orgId: event.orgId },
      include: { lines: true },
    });
    if (!batch || batch.status !== 'PENDING') return;

    if (event.status === 'REJECTED') {
      await this.prisma.shiftRegistrationBatch.update({
        where: { id: batch.id },
        data: { status: 'REJECTED' },
      });
      return;
    }
    await this.prisma.shiftRegistrationBatch.update({
      where: { id: batch.id },
      data: { status: 'APPROVED' },
    });
    for (const line of batch.lines) {
      await this.timesheet.applyShiftVariant(
        batch.orgId,
        line.employeeId,
        line.date.toISOString().slice(0, 10),
        line.variant,
      );
    }
  }
}
