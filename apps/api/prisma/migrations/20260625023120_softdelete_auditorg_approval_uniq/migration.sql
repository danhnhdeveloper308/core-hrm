-- DropIndex
DROP INDEX "Employee_orgId_code_key";

-- DropIndex
DROP INDEX "Organization_slug_key";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "orgId" UUID;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Employee_orgId_code_idx" ON "Employee"("orgId", "code");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- Partial UNIQUE: chỉ ràng buộc trên bản ghi CHƯA soft-delete → cho phép tái dùng
-- code/slug sau khi xoá (giữ unique cho dữ liệu đang hoạt động).
CREATE UNIQUE INDEX "Employee_orgId_code_active_key" ON "Employee"("orgId", "code") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Organization_slug_active_key" ON "Organization"("slug") WHERE "deletedAt" IS NULL;

-- Partial UNIQUE: chặn 2 phiếu duyệt PENDING cho cùng 1 đối tượng (chống double-submit).
CREATE UNIQUE INDEX "ApprovalInstance_pending_target_key" ON "ApprovalInstance"("targetType", "targetId") WHERE "status" = 'PENDING';
