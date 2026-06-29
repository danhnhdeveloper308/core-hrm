/**
 * Tham số lương/thuế/BH mặc định theo pháp luật VN (2024). Đưa vào PayrollConfig
 * khi khởi tạo để HR chỉnh khi luật đổi — KHÔNG hard-code rải rác trong engine.
 *
 * Tiền: integer VND. Tỷ lệ: basis points (bps) — 100 bps = 1%.
 */

/** 1 bậc thuế TNCN luỹ tiến từng phần: thu nhập tính thuế tháng tới `upTo` (VND,
 *  null = không trần) chịu thuế suất `rateBps`. */
export interface PitBracket {
  /** Trần thu nhập tính thuế/tháng của bậc (VND). null = bậc cao nhất. */
  upTo: number | null;
  /** Thuế suất (bps). */
  rateBps: number;
}

/** Biểu thuế TNCN luỹ tiến từng phần 7 bậc (VND/tháng). */
export const VN_PIT_BRACKETS: PitBracket[] = [
  { upTo: 5_000_000, rateBps: 500 }, // 5%
  { upTo: 10_000_000, rateBps: 1_000 }, // 10%
  { upTo: 18_000_000, rateBps: 1_500 }, // 15%
  { upTo: 32_000_000, rateBps: 2_000 }, // 20%
  { upTo: 52_000_000, rateBps: 2_500 }, // 25%
  { upTo: 80_000_000, rateBps: 3_000 }, // 30%
  { upTo: null, rateBps: 3_500 }, // 35%
];

export const VN_PAYROLL_DEFAULTS = {
  /** Giảm trừ bản thân/tháng. */
  personalDeduction: 11_000_000,
  /** Giảm trừ mỗi người phụ thuộc/tháng. */
  dependentDeduction: 4_400_000,
  /** Lương cơ sở — trần đóng BHXH/BHYT = 20× lương cơ sở. */
  baseSalaryGov: 2_340_000,
  /** Lương tối thiểu vùng (vùng I) — trần đóng BHTN = 20× mức này. */
  regionMinWage: 4_960_000,
  /** BHXH phần NV (bps). */
  bhxhRateBps: 800, // 8%
  /** BHYT phần NV (bps). */
  bhytRateBps: 150, // 1.5%
  /** BHTN phần NV (bps). */
  bhtnRateBps: 100, // 1%
  pitBrackets: VN_PIT_BRACKETS,
} as const;
