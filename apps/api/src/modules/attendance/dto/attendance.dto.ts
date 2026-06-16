import {
  attendanceRangeQuerySchema,
  checkInSchema,
  createCorrectionSchema,
  editTimesheetSchema,
  orgAttendanceQuerySchema,
  resetDaySchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class CheckInDto extends createZodDto(checkInSchema) {}
export class AttendanceRangeQueryDto extends createZodDto(attendanceRangeQuerySchema) {}
export class OrgAttendanceQueryDto extends createZodDto(orgAttendanceQuerySchema) {}
export class CreateCorrectionDto extends createZodDto(createCorrectionSchema) {}
export class EditTimesheetDto extends createZodDto(editTimesheetSchema) {}
export class ResetDayDto extends createZodDto(resetDaySchema) {}
