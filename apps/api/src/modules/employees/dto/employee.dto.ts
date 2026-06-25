import {
  createContractSchema,
  createDependentSchema,
  createEmployeeSchema,
  listEmployeesQuerySchema,
  updateDependentSchema,
  updateEmployeeSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class ListEmployeesQueryDto extends createZodDto(listEmployeesQuerySchema) {}
export class CreateEmployeeDto extends createZodDto(createEmployeeSchema) {}
export class UpdateEmployeeDto extends createZodDto(updateEmployeeSchema) {}
export class CreateContractDto extends createZodDto(createContractSchema) {}
export class CreateDependentDto extends createZodDto(createDependentSchema) {}
export class UpdateDependentDto extends createZodDto(updateDependentSchema) {}
