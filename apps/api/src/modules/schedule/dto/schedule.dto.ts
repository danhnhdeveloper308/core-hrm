import {
  assignShiftSchema,
  createHolidayCalendarSchema,
  createHolidaySchema,
  createWorkShiftSchema,
  updateScheduleDefaultsSchema,
  updateWorkShiftSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateWorkShiftDto extends createZodDto(createWorkShiftSchema) {}
export class UpdateWorkShiftDto extends createZodDto(updateWorkShiftSchema) {}
export class AssignShiftDto extends createZodDto(assignShiftSchema) {}
export class CreateHolidayCalendarDto extends createZodDto(
  createHolidayCalendarSchema,
) {}
export class CreateHolidayDto extends createZodDto(createHolidaySchema) {}
export class UpdateScheduleDefaultsDto extends createZodDto(
  updateScheduleDefaultsSchema,
) {}
