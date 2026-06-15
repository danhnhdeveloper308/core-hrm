import {
  createOrganizationSchema,
  listOrganizationsQuerySchema,
  updateOrganizationSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class ListOrganizationsQueryDto extends createZodDto(
  listOrganizationsQuerySchema,
) {}
export class CreateOrganizationDto extends createZodDto(createOrganizationSchema) {}
export class UpdateOrganizationDto extends createZodDto(updateOrganizationSchema) {}
