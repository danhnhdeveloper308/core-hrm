import type {
  ApprovalStatus,
  LeaveEntryType,
  LeaveHalf,
  LeaveRequestStatus,
} from '@repo/shared';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export const LEAVE_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã huỷ (người gửi)',
};

export const LEAVE_STATUS_BADGE: Record<LeaveRequestStatus, BadgeVariant> = {
  PENDING: 'secondary',
  APPROVED: 'default',
  REJECTED: 'destructive',
  CANCELLED: 'outline',
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã huỷ (người gửi)',
};

export const APPROVAL_STATUS_BADGE: Record<ApprovalStatus, BadgeVariant> = {
  PENDING: 'secondary',
  APPROVED: 'default',
  REJECTED: 'destructive',
  CANCELLED: 'outline',
};

export const HALF_LABELS: Record<LeaveHalf, string> = {
  FULL: 'cả ngày',
  AM: 'sáng',
  PM: 'chiều',
};

export const LEAVE_ENTRY_LABELS: Record<LeaveEntryType, string> = {
  ACCRUAL: 'Cấp phép',
  USAGE: 'Sử dụng',
  REVERT: 'Hoàn lại',
  CARRY_OVER: 'Chuyển kỳ',
  EXPIRY: 'Hết hạn',
  ADJUSTMENT: 'Điều chỉnh',
};

export const TARGET_TYPE_LABELS: Record<string, string> = {
  LEAVE: 'Nghỉ phép',
  ATTENDANCE_CORRECTION: 'Điều chỉnh công',
  OT: 'Tăng ca',
  SHIFT_BATCH: 'Phiếu tăng/giãn ca',
};

/** "2" / "1.5" → bỏ số 0 thừa. */
export function fmtDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** ISO/yyyy-mm-dd → dd/mm/yyyy. */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** ISO → dd/mm HH:mm. */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
