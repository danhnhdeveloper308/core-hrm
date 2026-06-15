import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'auditAction';

/**
 * Khai báo action audit cho route mutation, vd @Audit('user.update').
 * AuditInterceptor global đọc metadata này để ghi log — route mutation
 * thiếu @Audit sẽ bị log warning.
 */
export const Audit = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);
