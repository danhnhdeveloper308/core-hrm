import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Store theo request (AsyncLocalStorage) cho metadata audit.
 * AuditInterceptor mở store ở đầu request; service (vd RolesService) gọi
 * `addAuditMetadata({ before, after })` để đính diff vào bản ghi audit
 * mà không cần truyền Request xuống tầng service.
 */
export interface AuditContextStore {
  metadata: Record<string, unknown>;
}

export const auditStorage = new AsyncLocalStorage<AuditContextStore>();

export function addAuditMetadata(patch: Record<string, unknown>): void {
  const store = auditStorage.getStore();
  if (store) Object.assign(store.metadata, patch);
}
