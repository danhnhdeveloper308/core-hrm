-- CreateTable
CREATE TABLE "OtPolicy" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "orgUnitId" UUID,
    "maxHoursPerMonth" INTEGER NOT NULL DEFAULT 40,
    "maxHoursPerYear" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtPolicy_orgId_idx" ON "OtPolicy"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OtPolicy_orgId_orgUnitId_key" ON "OtPolicy"("orgId", "orgUnitId");

-- AddForeignKey
ALTER TABLE "OtPolicy" ADD CONSTRAINT "OtPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtPolicy" ADD CONSTRAINT "OtPolicy_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
