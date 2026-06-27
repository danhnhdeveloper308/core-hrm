-- CreateEnum
CREATE TYPE "ManpowerRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApprovalTargetType" ADD VALUE 'MANPOWER_REQUEST';
ALTER TYPE "ApprovalTargetType" ADD VALUE 'OFFER';

-- CreateTable
CREATE TABLE "ManpowerRequest" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "orgUnitId" UUID,
    "positionId" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "neededBy" DATE,
    "budgetSalary" INTEGER,
    "status" "ManpowerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requesterId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManpowerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManpowerRequest_orgId_status_idx" ON "ManpowerRequest"("orgId", "status");

-- AddForeignKey
ALTER TABLE "ManpowerRequest" ADD CONSTRAINT "ManpowerRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManpowerRequest" ADD CONSTRAINT "ManpowerRequest_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManpowerRequest" ADD CONSTRAINT "ManpowerRequest_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManpowerRequest" ADD CONSTRAINT "ManpowerRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
