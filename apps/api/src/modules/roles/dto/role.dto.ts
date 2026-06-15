import {
  createRoleSchema,
  listRolesQuerySchema,
  setRolePermissionsSchema,
  updateRoleSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateRoleDto extends createZodDto(createRoleSchema) {}
export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}
export class SetRolePermissionsDto extends createZodDto(setRolePermissionsSchema) {}
export class ListRolesQueryDto extends createZodDto(listRolesQuerySchema) {}
