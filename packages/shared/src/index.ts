// @repo/shared — zod schemas, types, constants dùng chung FE/BE.
// Zod là source of truth: backend (nestjs-zod DTO) và frontend (RHF resolver)
// đều import từ đây, tuyệt đối không duplicate schema.

export * from './constants/permissions';
export * from './constants/roles';
export * from './constants/error-codes';
export * from './constants/org-presets';

export * from './schemas/common';
export * from './schemas/auth';
export * from './schemas/user';
export * from './schemas/role';
export * from './schemas/session';
export * from './schemas/audit';
export * from './schemas/org';
export * from './schemas/employee';
export * from './schemas/shift';

export * from './types/api';
export * from './types/socket';
