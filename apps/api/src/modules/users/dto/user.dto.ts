import {
  assignRolesSchema,
  inviteUserSchema,
  listUsersQuerySchema,
  updateProfileSchema,
  updateUserStatusSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class ListUsersQueryDto extends createZodDto(listUsersQuerySchema) {}
export class InviteUserDto extends createZodDto(inviteUserSchema) {}
export class UpdateUserStatusDto extends createZodDto(updateUserStatusSchema) {}
export class AssignRolesDto extends createZodDto(assignRolesSchema) {}
export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
