import {
  createOtPolicySchema,
  overtimeSummaryQuerySchema,
  updateOtPolicySchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class OvertimeSummaryQueryDto extends createZodDto(
  overtimeSummaryQuerySchema,
) {}

export class CreateOtPolicyDto extends createZodDto(createOtPolicySchema) {}

export class UpdateOtPolicyDto extends createZodDto(updateOtPolicySchema) {}
