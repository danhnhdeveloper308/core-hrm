import { orgAttendanceQuerySchema } from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class AttendanceReportQueryDto extends createZodDto(orgAttendanceQuerySchema) {}
