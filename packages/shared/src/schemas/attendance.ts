import { z } from 'zod';
import { dateOnlySchema } from './employee';

export const attendanceTypeSchema = z.enum(['IN', 'OUT', 'UNKNOWN']);
export type AttendanceType = z.infer<typeof attendanceTypeSchema>;

export const attendanceSourceSchema = z.enum([
  'FACE',
  'FINGERPRINT',
  'MANUAL',
  'WEB',
]);
export type AttendanceSource = z.infer<typeof attendanceSourceSchema>;

export const timesheetStatusSchema = z.enum([
  'PRESENT',
  'LATE',
  'EARLY_LEAVE',
  'LATE_AND_EARLY',
  'ABSENT',
  'ON_LEAVE',
  'HALF_LEAVE',
  'HOLIDAY',
  'WEEKEND',
  'NOT_SCHEDULED',
]);
export type TimesheetStatus = z.infer<typeof timesheetStatusSchema>;

// ===== Check-in (WEB ở Phase 4; FACE/location mở rộng ở Phase 5) =====

export const checkInSchema = z.object({
  /** IN/OUT — bỏ trống để hệ thống tự suy theo log gần nhất trong ngày. */
  type: z.enum(['IN', 'OUT']).optional(),
  note: z.string().trim().max(500).optional(),
  /** Toạ độ trình duyệt (coerce vì multipart gửi chuỗi). */
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().min(0).optional(),
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export const attendanceLogSchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  recordedAt: z.string(),
  type: attendanceTypeSchema,
  source: attendanceSourceSchema,
  worksiteId: z.uuid().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  accuracy: z.number().nullable(),
  locationSuspect: z.boolean(),
  faceScore: z.number().nullable(),
  note: z.string().nullable(),
});
export type AttendanceLogResponse = z.infer<typeof attendanceLogSchema>;

// ===== Timesheet =====

export const timesheetDaySchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  date: z.string(),
  shiftId: z.uuid().nullable(),
  firstIn: z.string().nullable(),
  lastOut: z.string().nullable(),
  status: timesheetStatusSchema,
  lateMinutes: z.number().int(),
  earlyMinutes: z.number().int(),
  workMinutes: z.number().int(),
  otMinutes: z.number().int(),
  /** HR đã sửa tay & khóa — recalc tự động không ghi đè. */
  locked: z.boolean().default(false),
  note: z.string().nullable().default(null),
});
export type TimesheetDayResponse = z.infer<typeof timesheetDaySchema>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ HH:mm');

/** HR sửa giờ công thủ công (attendance:correct) — khóa ngày sau khi sửa. */
export const editTimesheetSchema = z.object({
  employeeId: z.uuid(),
  date: dateOnlySchema,
  firstIn: hhmm,
  lastOut: hhmm.nullish(),
  note: z.string().trim().max(500).nullish(),
});
export type EditTimesheetInput = z.infer<typeof editTimesheetSchema>;

/** Reset (xóa) công 1 ngày của nhân viên. */
export const resetDaySchema = z.object({
  employeeId: z.uuid(),
  date: dateOnlySchema,
});
export type ResetDayInput = z.infer<typeof resetDaySchema>;

export const attendanceRangeQuerySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
});
export type AttendanceRangeQuery = z.infer<typeof attendanceRangeQuerySchema>;

export const orgAttendanceQuerySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  employeeId: z.uuid().optional(),
  orgUnitId: z.uuid().optional(),
});
export type OrgAttendanceQuery = z.infer<typeof orgAttendanceQuerySchema>;

/** Lưới công tháng: 1 hàng = 1 nhân viên, days map date→status cho AG Grid. */
export const timesheetGridRowSchema = z.object({
  employeeId: z.uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  orgUnitName: z.string().nullable(),
  days: z.record(z.string(), timesheetDaySchema),
});
export type TimesheetGridRow = z.infer<typeof timesheetGridRowSchema>;

// ===== Correction (sửa công thủ công) =====

export const correctionStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type CorrectionStatus = z.infer<typeof correctionStatusSchema>;

export const createCorrectionSchema = z
  .object({
    employeeId: z.uuid(),
    date: dateOnlySchema,
    /** "HH:mm" giờ vào/ra mong muốn — ít nhất 1 trong 2. */
    requestedIn: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullish(),
    requestedOut: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullish(),
    reason: z.string().trim().min(1).max(500),
  })
  .refine((v) => v.requestedIn || v.requestedOut, {
    message: 'Cần ít nhất giờ vào hoặc giờ ra',
  });
export type CreateCorrectionInput = z.infer<typeof createCorrectionSchema>;

/** Nhân viên TỰ xin sửa công cho chính mình (qua luồng duyệt). */
export const requestCorrectionSchema = z
  .object({
    date: dateOnlySchema,
    requestedIn: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullish(),
    requestedOut: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullish(),
    reason: z.string().trim().min(1).max(500),
  })
  .refine((v) => v.requestedIn || v.requestedOut, {
    message: 'Cần ít nhất giờ vào hoặc giờ ra',
  });
export type RequestCorrectionInput = z.infer<typeof requestCorrectionSchema>;

export const correctionRequestResponseSchema = z.object({
  id: z.uuid(),
  date: z.string(),
  requestedIn: z.string().nullable(),
  requestedOut: z.string().nullable(),
  reason: z.string(),
  status: correctionStatusSchema,
  createdAt: z.string(),
});
export type CorrectionRequestResponse = z.infer<typeof correctionRequestResponseSchema>;
