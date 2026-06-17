-- CreateEnum
CREATE TYPE "OtCalcMode" AS ENUM ('CLAMP_TO_REGISTERED', 'SEPARATE_OT');

-- CreateEnum
CREATE TYPE "ShiftVariant" AS ENUM ('XUONG_CA', 'GIAN_CA', 'TANG_CA');

-- AlterEnum
ALTER TYPE "ApprovalTargetType" ADD VALUE 'SHIFT_BATCH';

-- AlterTable
ALTER TABLE "ApprovalFlowStep" ADD COLUMN     "label" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "otCalcMode" "OtCalcMode" NOT NULL DEFAULT 'CLAMP_TO_REGISTERED';

-- AlterTable
ALTER TABLE "WorkShift" ADD COLUMN     "gianCaEnd" TEXT,
ADD COLUMN     "otCalcMode" "OtCalcMode",
ADD COLUMN     "tangCaEnd" TEXT;

-- CreateTable
CREATE TABLE "ShiftRegistrationBatch" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftRegistrationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftRegistrationLine" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "variant" "ShiftVariant" NOT NULL,
    "reason" TEXT,

    CONSTRAINT "ShiftRegistrationLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftRegistrationBatch_orgId_status_idx" ON "ShiftRegistrationBatch"("orgId", "status");

-- CreateIndex
CREATE INDEX "ShiftRegistrationLine_batchId_idx" ON "ShiftRegistrationLine"("batchId");

-- CreateIndex
CREATE INDEX "ShiftRegistrationLine_orgId_employeeId_date_idx" ON "ShiftRegistrationLine"("orgId", "employeeId", "date");

-- AddForeignKey
ALTER TABLE "ShiftRegistrationBatch" ADD CONSTRAINT "ShiftRegistrationBatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRegistrationLine" ADD CONSTRAINT "ShiftRegistrationLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRegistrationLine" ADD CONSTRAINT "ShiftRegistrationLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ShiftRegistrationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRegistrationLine" ADD CONSTRAINT "ShiftRegistrationLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
