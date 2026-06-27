/*
  Warnings:

  - A unique constraint covering the columns `[orgId,code]` on the table `EmploymentContract` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContractType" ADD VALUE 'SEASONAL';
ALTER TYPE "ContractType" ADD VALUE 'SERVICE';
ALTER TYPE "ContractType" ADD VALUE 'APPRENTICESHIP';

-- AlterTable
ALTER TABLE "EmploymentContract" ADD COLUMN     "allowanceJson" JSONB,
ADD COLUMN     "baseSalary" INTEGER,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "parentId" UUID,
ADD COLUMN     "signedDate" DATE,
ADD COLUMN     "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "terminateDate" DATE,
ADD COLUMN     "terminateReason" TEXT;

-- CreateIndex
CREATE INDEX "EmploymentContract_orgId_status_idx" ON "EmploymentContract"("orgId", "status");

-- CreateIndex
CREATE INDEX "EmploymentContract_orgId_endDate_idx" ON "EmploymentContract"("orgId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentContract_orgId_code_key" ON "EmploymentContract"("orgId", "code");

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EmploymentContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
