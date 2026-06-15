import {
  attendanceRangeQuerySchema,
  checkInSchema,
  createCorrectionSchema,
  orgAttendanceQuerySchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class CheckInDto extends createZodDto(checkInSchema) {}
export class AttendanceRangeQueryDto extends createZodDto(attendanceRangeQuerySchema) {}
export class OrgAttendanceQueryDto extends createZodDto(orgAttendanceQuerySchema) {}
export class CreateCorrectionDto extends createZodDto(createCorrectionSchema) {}
