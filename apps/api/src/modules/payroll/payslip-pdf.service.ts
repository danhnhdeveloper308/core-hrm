import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import type { PayslipResponse } from '@repo/shared';
import PDFDocument from 'pdfkit';

// Font bundle (DejaVu Sans — phủ đầy đủ tiếng Việt + ký hiệu ₫).
// Chạy từ dist (cả dev `nest start` lẫn prod) → assets được nest-cli copy sang
// dist/assets/fonts (xem nest-cli.json).
const FONT_DIR = join(__dirname, '..', '..', 'assets', 'fonts');
const FONT_REGULAR = join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = join(FONT_DIR, 'DejaVuSans-Bold.ttf');

const COLOR = {
  text: '#111827',
  muted: '#6b7280',
  line: '#d1d5db',
  earn: '#15803d',
  deduct: '#b91c1c',
  primary: '#1d4ed8',
} as const;

/** Định dạng tiền VND nguyên — nhóm nghìn bằng '.', không phụ thuộc ICU. */
function money(v: number): string {
  const neg = v < 0;
  const s = Math.abs(Math.round(v))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${s} ₫`;
}

export interface PayslipPdfOptions {
  orgName?: string | null;
}

/** Sinh PDF cho 1 phiếu lương — thuần (không chạm DB). */
@Injectable()
export class PayslipPdfService {
  render(p: PayslipResponse, opts: PayslipPdfOptions = {}): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 48 });
        doc.registerFont('body', FONT_REGULAR);
        doc.registerFont('bold', FONT_BOLD);

        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (e) => reject(e instanceof Error ? e : new Error(String(e))));

        this.draw(doc, p, opts);
        doc.end();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  private draw(
    doc: PDFKit.PDFDocument,
    p: PayslipResponse,
    opts: PayslipPdfOptions,
  ): void {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    const kv = (
      label: string,
      value: string,
      o: { bold?: boolean; size?: number; color?: string } = {},
    ): void => {
      const y = doc.y;
      doc
        .font(o.bold ? 'bold' : 'body')
        .fontSize(o.size ?? 10)
        .fillColor(COLOR.muted)
        .text(label, left, y, { width: width * 0.62 });
      const afterLabel = doc.y;
      doc
        .font(o.bold ? 'bold' : 'body')
        .fillColor(o.color ?? COLOR.text)
        .text(value, left, y, { width, align: 'right' });
      doc.y = Math.max(afterLabel, doc.y);
      doc.moveDown(0.25);
    };

    const section = (title: string, color: string): void => {
      doc.moveDown(0.6);
      doc.font('bold').fontSize(11).fillColor(color).text(title, left);
      const y = doc.y + 2;
      doc.moveTo(left, y).lineTo(right, y).strokeColor(COLOR.line).lineWidth(0.7).stroke();
      doc.moveDown(0.4);
    };

    // ---- Header ----
    doc.font('bold').fontSize(18).fillColor(COLOR.text).text('PHIẾU LƯƠNG', {
      align: 'center',
    });
    if (opts.orgName) {
      doc
        .font('body')
        .fontSize(11)
        .fillColor(COLOR.muted)
        .text(opts.orgName, { align: 'center' });
    }
    doc
      .font('body')
      .fontSize(10)
      .fillColor(COLOR.muted)
      .text(`Kỳ lương: ${p.month ?? '—'}`, { align: 'center' });
    doc.moveDown(0.8);

    // ---- Thông tin ----
    kv('Nhân viên', p.employeeName ?? '—', { bold: true, color: COLOR.text });
    kv('Ngày công', `${p.workdays ?? 0} ngày`);
    kv('Tăng ca', `${Math.round((p.otMinutes / 60) * 10) / 10} giờ`);
    kv('Thu nhập tính thuế', money(p.taxableIncome));

    // ---- Thu nhập ----
    const earnings = p.breakdown.filter((l) => l.kind === 'EARNING');
    section('THU NHẬP', COLOR.earn);
    for (const l of earnings) kv(l.label, money(l.amount));
    kv('Tổng thu nhập', money(p.grossEarnings), { bold: true, color: COLOR.text });

    // ---- Khấu trừ ----
    const deductions = p.breakdown.filter((l) => l.kind === 'DEDUCTION');
    section('KHẤU TRỪ', COLOR.deduct);
    for (const l of deductions) kv(l.label, `-${money(l.amount)}`);
    kv(
      'Tổng khấu trừ',
      `-${money(p.insuranceTotal + p.pit + p.otherDeductions)}`,
      { bold: true, color: COLOR.text },
    );

    // ---- Thực lĩnh ----
    doc.moveDown(0.8);
    const boxY = doc.y;
    doc
      .roundedRect(left, boxY, width, 34, 6)
      .fillColor('#eff6ff')
      .fill();
    doc
      .font('bold')
      .fontSize(13)
      .fillColor(COLOR.primary)
      .text('THỰC LĨNH', left + 12, boxY + 9, { width: width - 24 });
    doc
      .font('bold')
      .fontSize(13)
      .fillColor(COLOR.primary)
      .text(money(p.netPay), left, boxY + 9, { width: width - 12, align: 'right' });
    doc.y = boxY + 34;

    // ---- Footer ----
    doc.moveDown(1.2);
    doc
      .font('body')
      .fontSize(8)
      .fillColor(COLOR.muted)
      .text(
        `Phiếu lương được tạo tự động ngày ${new Date().toLocaleDateString('vi-VN')}. ` +
          'Tài liệu mật — chỉ dành cho người lao động liên quan.',
        left,
        undefined,
        { width, align: 'center' },
      );
  }
}
