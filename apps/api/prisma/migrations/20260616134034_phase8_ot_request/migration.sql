-- CreateEnum
CREATE TYPE "OtRequestType" AS ENUM ('OVERTIME', 'SHIFT_SHIFT');

-- CreateTable
CREATE TABLE "OtRequest" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "OtRequestType" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtRequest_orgId_employeeId_date_idx" ON "OtRequest"("orgId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "OtRequest_orgId_status_idx" ON "OtRequest"("orgId", "status");

-- AddForeignKey
ALTER TABLE "OtRequest" ADD CONSTRAINT "OtRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtRequest" ADD CONSTRAINT "OtRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
