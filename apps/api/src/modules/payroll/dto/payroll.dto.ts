import {
  createBenefitPlanSchema,
  createEmployeeBenefitSchema,
  createEmployeeSalarySchema,
  createSalaryComponentSchema,
  listBenefitPlansQuerySchema,
  listEmployeeBenefitsQuerySchema,
  listEmployeeSalariesQuerySchema,
  listSalaryComponentsQuerySchema,
  updateBenefitPlanSchema,
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

export class CreateBenefitPlanDto extends createZodDto(
  createBenefitPlanSchema,
) {}

export class UpdateBenefitPlanDto extends createZodDto(
  updateBenefitPlanSchema,
) {}

export class ListBenefitPlansQueryDto extends createZodDto(
  listBenefitPlansQuerySchema,
) {}

export class CreateEmployeeBenefitDto extends createZodDto(
  createEmployeeBenefitSchema,
) {}

export class ListEmployeeBenefitsQueryDto extends createZodDto(
  listEmployeeBenefitsQuerySchema,
) {}
