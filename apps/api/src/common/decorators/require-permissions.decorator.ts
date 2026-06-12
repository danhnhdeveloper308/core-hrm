import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@repo/shared';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Yêu cầu user có TẤT CẢ permissions liệt kê (AND). */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
