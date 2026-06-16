import { z } from 'zod';
import { dateOnlySchema } from './employee';

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Định dạng giờ HH:mm');

export const workShiftSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  breakStart: z.string().nullable(),
  breakEnd: z.string().nullable(),
  breakMinutes: z.number().int(),
  lateGraceMinutes: z.number().int(),
  otEnabled: z.boolean(),
  workDays: z.array(z.number().int()),
});
export type WorkShiftResponse = z.infer<typeof workShiftSchema>;

const workShiftBaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  startTime: timeSchema,
  endTime: timeSchema,
  /** Cửa sổ nghỉ trưa — để trống thì dùng breakMinutes (trừ cứng). */
  breakStart: timeSchema.nullish(),
  breakEnd: timeSchema.nullish(),
  breakMinutes: z.number().int().min(0).max(480).default(60),
  lateGraceMinutes: z.number().int().min(0).max(120).default(5),
  otEnabled: z.boolean().default(false),
  /** 1=Thứ 2 ... 7=Chủ nhật. */
  workDays: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .default([1, 2, 3, 4, 5]),
});

/** Cửa sổ nghỉ trưa: cần đủ cặp + bắt đầu trước kết thúc. */
function validBreakWindow(v: {
  breakStart?: string | null;
  breakEnd?: string | null;
}): boolean {
  if (v.breakStart && !v.breakEnd) return false;
  if (v.breakStart && v.breakEnd && v.breakStart >= v.breakEnd) return false;
  return true;
}
const breakWindowMsg = {
  message: 'Cần cặp giờ nghỉ trưa hợp lệ (bắt đầu trước kết thúc)',
  path: ['breakEnd'],
};

export const createWorkShiftSchema = workShiftBaseSchema.refine(
  validBreakWindow,
  breakWindowMsg,
);
export type CreateWorkShiftInput = z.infer<typeof workShiftBaseSchema>;

export const updateWorkShiftSchema = workShiftBaseSchema
  .partial()
  .refine(validBreakWindow, breakWindowMsg);
export type UpdateWorkShiftInput = Partial<CreateWorkShiftInput>;

/** Gán ca: đúng 1 trong employeeId (cá nhân) / orgUnitId (cả subtree). */
export const assignShiftSchema = z
  .object({
    shiftId: z.uuid(),
    effectiveFrom: dateOnlySchema,
    employeeId: z.uuid().optional(),
    orgUnitId: z.uuid().optional(),
  })
  .refine((v) => (v.employeeId ? !v.orgUnitId : !!v.orgUnitId), {
    message: 'Truyền đúng một trong employeeId hoặc orgUnitId',
  });
export type AssignShiftInput = z.infer<typeof assignShiftSchema>;

export const shiftAssignmentSchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  shiftId: z.uuid(),
  shiftName: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
});
export type ShiftAssignmentResponse = z.infer<typeof shiftAssignmentSchema>;

// ===== Holiday calendar =====

export const holidaySchema = z.object({
  id: z.uuid(),
  date: z.string(),
  name: z.string(),
  isHalfDay: z.boolean(),
});
export type HolidayResponse = z.infer<typeof holidaySchema>;

export const holidayCalendarSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  holidayCount: z.number().int(),
});
export type HolidayCalendarResponse = z.infer<typeof holidayCalendarSchema>;

export const createHolidayCalendarSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
export type CreateHolidayCalendarInput = z.infer<typeof createHolidayCalendarSchema>;

export const createHolidaySchema = z.object({
  date: dateOnlySchema,
  name: z.string().trim().min(1).max(200),
  isHalfDay: z.boolean().default(false),
});
export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;

/** Cấu hình mặc định ca/lịch — cho org (PATCH /org/defaults) và OrgUnit. */
export const updateScheduleDefaultsSchema = z.object({
  defaultShiftId: z.uuid().nullable().optional(),
  defaultCalendarId: z.uuid().nullable().optional(),
});
export type UpdateScheduleDefaultsInput = z.infer<
  typeof updateScheduleDefaultsSchema
>;
