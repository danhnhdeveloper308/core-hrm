import {
  createEmployeeSalarySchema,
  createSalaryComponentSchema,
  listEmployeeSalariesQuerySchema,
  listSalaryComponentsQuerySchema,
  updatePayrollConfigSchema,
  updateSalaryComponentSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class UpdatePayrollConfigDto extends createZodDto(
  updatePayrollConfigSchema,
) {}

export class CreateSalaryComponentDto extends createZodDto(
  createSalaryComponentSchema,
) {}

export class UpdateSalaryComponentDto extends createZodDto(
  updateSalaryComponentSchema,
) {}

export class ListSalaryComponentsQueryDto extends createZodDto(
  listSalaryComponentsQuerySchema,
) {}

export class CreateEmployeeSalaryDto extends createZodDto(
  createEmployeeSalarySchema,
) {}

export class ListEmployeeSalariesQueryDto extends createZodDto(
  listEmployeeSalariesQuerySchema,
) {}
