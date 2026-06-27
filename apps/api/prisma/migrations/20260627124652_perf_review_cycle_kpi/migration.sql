-- CreateEnum
CREATE TYPE "ReviewCycleType" AS ENUM ('QUARTERLY', 'SEMI', 'ANNUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReviewCycleStatus" AS ENUM ('DRAFT', 'OPEN', 'CALIBRATING', 'CLOSED');

-- CreateEnum
CREATE TYPE "KpiDirection" AS ENUM ('HIGHER_BETTER', 'LOWER_BETTER');

-- CreateTable
CREATE TABLE "ReviewCycle" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ReviewCycleType" NOT NULL DEFAULT 'QUARTERLY',
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "ReviewCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiDefinition" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT,
    "direction" "KpiDirection" NOT NULL DEFAULT 'HIGHER_BETTER',
    "defaultWeight" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewCycle_orgId_status_idx" ON "ReviewCycle"("orgId", "status");

-- CreateIndex
CREATE INDEX "KpiDefinition_orgId_active_idx" ON "KpiDefinition"("orgId", "active");

-- AddForeignKey
ALTER TABLE "ReviewCycle" ADD CONSTRAINT "ReviewCycle_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiDefinition" ADD CONSTRAINT "KpiDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
