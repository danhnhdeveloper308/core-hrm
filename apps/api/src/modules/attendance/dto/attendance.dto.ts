import {
  attendanceRangeQuerySchema,
  checkInSchema,
  createCorrectionSchema,
  createOtRequestSchema,
  editTimesheetSchema,
  orgAttendanceQuerySchema,
  requestCorrectionSchema,
  resetDaySchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class CheckInDto extends createZodDto(checkInSchema) {}
export class AttendanceRangeQueryDto extends createZodDto(attendanceRangeQuerySchema) {}
export class OrgAttendanceQueryDto extends createZodDto(orgAttendanceQuerySchema) {}
export class CreateCorrectionDto extends createZodDto(createCorrectionSchema) {}
export class RequestCorrectionDto extends createZodDto(requestCorrectionSchema) {}
export class CreateOtRequestDto extends createZodDto(createOtRequestSchema) {}
export class EditTimesheetDto extends createZodDto(editTimesheetSchema) {}
export class ResetDayDto extends createZodDto(resetDaySchema) {}
