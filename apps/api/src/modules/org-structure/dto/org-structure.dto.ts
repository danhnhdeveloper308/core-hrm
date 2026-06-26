import {
  createOrgUnitSchema,
  createOrgUnitTypeSchema,
  createPositionSchema,
  createWorksiteSchema,
  moveOrgUnitSchema,
  seedUnitTypePresetSchema,
  updateOrganizationSchema,
  updateOrgUnitSchema,
  updateOrgUnitTypeSchema,
  updatePositionSchema,
  updateWorksiteSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

// Org tự sửa: không cho đổi status (chỉ platform admin)
export class UpdateOwnOrgDto extends createZodDto(
  updateOrganizationSchema.omit({ status: true }),
) {}

export class CreateOrgUnitTypeDto extends createZodDto(createOrgUnitTypeSchema) {}
export class UpdateOrgUnitTypeDto extends createZodDto(updateOrgUnitTypeSchema) {}
export class SeedUnitTypePresetDto extends createZodDto(seedUnitTypePresetSchema) {}

export class CreateOrgUnitDto extends createZodDto(createOrgUnitSchema) {}
export class UpdateOrgUnitDto extends createZodDto(updateOrgUnitSchema) {}
export class MoveOrgUnitDto extends createZodDto(moveOrgUnitSchema) {}

export class CreatePositionDto extends createZodDto(createPositionSchema) {}
export class UpdatePositionDto extends createZodDto(updatePositionSchema) {}

export class CreateWorksiteDto extends createZodDto(createWorksiteSchema) {}
export class UpdateWorksiteDto extends createZodDto(updateWorksiteSchema) {}
