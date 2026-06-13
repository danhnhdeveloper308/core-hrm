import {
  createContractSchema,
  createEmployeeSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class ListEmployeesQueryDto extends createZodDto(listEmployeesQuerySchema) {}
export class CreateEmployeeDto extends createZodDto(createEmployeeSchema) {}
export class UpdateEmployeeDto extends createZodDto(updateEmployeeSchema) {}
export class CreateContractDto extends createZodDto(createContractSchema) {}
