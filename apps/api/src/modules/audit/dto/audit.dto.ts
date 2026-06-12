import { auditQuerySchema } from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class AuditQueryDto extends createZodDto(auditQuerySchema) {}
