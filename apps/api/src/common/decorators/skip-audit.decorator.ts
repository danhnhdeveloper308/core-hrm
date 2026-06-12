import { SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_KEY = 'skipAudit';

/**
 * Route/controller tự ghi audit ở tầng service (vd auth flows có ngữ cảnh
 * riêng: register chưa có req.user, login ghi kèm provider...) — interceptor
 * bỏ qua, không warning.
 */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
