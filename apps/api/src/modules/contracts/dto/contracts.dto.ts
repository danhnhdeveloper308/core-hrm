import {
  createOrgContractSchema,
  listContractsQuerySchema,
  terminateContractSchema,
  updateContractSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class ListContractsQueryDto extends createZodDto(listContractsQuerySchema) {}

export class CreateOrgContractDto extends createZodDto(createOrgContractSchema) {}

export class UpdateContractDto extends createZodDto(updateContractSchema) {}

export class TerminateContractDto extends createZodDto(terminateContractSchema) {}
