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
  breakMinutes: z.number().int(),
  lateGraceMinutes: z.number().int(),
  otEnabled: z.boolean(),
  workDays: z.array(z.number().int()),
});
export type WorkShiftResponse = z.infer<typeof workShiftSchema>;

export const createWorkShiftSchema = z.object({
  name: z.string().trim().min(1).max(200),
  startTime: timeSchema,
  endTime: timeSchema,
  breakMinutes: z.number().int().min(0).max(480).default(60),
  lateGraceMinutes: z.number().int().min(0).max(120).default(5),
  otEnabled: z.boolean().default(false),
  /** 1=Thứ 2 ... 7=Chủ nhật. */
  workDays: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .default([1, 2, 3, 4, 5]),
});
export type CreateWorkShiftInput = z.infer<typeof createWorkShiftSchema>;

export const updateWorkShiftSchema = createWorkShiftSchema.partial();
export type UpdateWorkShiftInput = z.infer<typeof updateWorkShiftSchema>;

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
