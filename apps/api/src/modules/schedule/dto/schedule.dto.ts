import {
  assignShiftSchema,
  createHolidayCalendarSchema,
  createHolidaySchema,
  updateHolidaySchema,
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
export class UpdateHolidayDto extends createZodDto(updateHolidaySchema) {}
export class UpdateScheduleDefaultsDto extends createZodDto(
  updateScheduleDefaultsSchema,
) {}
