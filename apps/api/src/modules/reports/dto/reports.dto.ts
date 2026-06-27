import { orgAttendanceQuerySchema, orgChartQuerySchema } from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class AttendanceReportQueryDto extends createZodDto(orgAttendanceQuerySchema) {}

export class OrgChartQueryDto extends createZodDto(orgChartQuerySchema) {}
