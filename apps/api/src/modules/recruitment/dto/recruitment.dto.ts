import {
  createManpowerRequestSchema,
  listManpowerRequestsQuerySchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateManpowerRequestDto extends createZodDto(
  createManpowerRequestSchema,
) {}

export class ListManpowerRequestsQueryDto extends createZodDto(
  listManpowerRequestsQuerySchema,
) {}
