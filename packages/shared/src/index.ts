// @repo/shared — zod schemas, types, constants dùng chung FE/BE.
// Zod là source of truth: backend (nestjs-zod DTO) và frontend (RHF resolver)
// đều import từ đây, tuyệt đối không duplicate schema.

export * from './constants/auth';
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
export * from './schemas/attendance';
export * from './schemas/leave';
export * from './schemas/approval';
export * from './schemas/attachment';
export * from './schemas/shift-registration';
export * from './schemas/notification';
export * from './schemas/reports';
export * from './schemas/overtime';

export * from './types/api';
export * from './types/socket';
