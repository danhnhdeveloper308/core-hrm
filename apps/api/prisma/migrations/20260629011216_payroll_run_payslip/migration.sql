-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'PAID');

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "runAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "workdays" DOUBLE PRECISION,
    "otMinutes" INTEGER NOT NULL DEFAULT 0,
    "baseSalary" INTEGER NOT NULL DEFAULT 0,
    "grossEarnings" INTEGER NOT NULL DEFAULT 0,
    "taxableIncome" INTEGER NOT NULL DEFAULT 0,
    "insuranceBase" INTEGER NOT NULL DEFAULT 0,
    "bhxh" INTEGER NOT NULL DEFAULT 0,
    "bhyt" INTEGER NOT NULL DEFAULT 0,
    "bhtn" INTEGER NOT NULL DEFAULT 0,
    "insuranceTotal" INTEGER NOT NULL DEFAULT 0,
    "pit" INTEGER NOT NULL DEFAULT 0,
    "otherDeductions" INTEGER NOT NULL DEFAULT 0,
    "netPay" INTEGER NOT NULL DEFAULT 0,
    "breakdownJson" JSONB,
    "fileKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollRun_orgId_status_idx" ON "PayrollRun"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_orgId_month_key" ON "PayrollRun"("orgId", "month");

-- CreateIndex
CREATE INDEX "Payslip_orgId_employeeId_idx" ON "Payslip"("orgId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_runId_employeeId_key" ON "Payslip"("runId", "employeeId");

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
