import { Global, Module } from '@nestjs/common';
import { PermissionsCacheService } from './permissions-cache.service';

/** Global — PermissionsGuard (APP_GUARD) và mọi module RBAC cần cache này. */
@Global()
@Module({
  providers: [PermissionsCacheService],
  exports: [PermissionsCacheService],
})
export class RbacModule {}
