-- CreateEnum
CREATE TYPE "SalaryComponentKind" AS ENUM ('EARNING', 'DEDUCTION');

-- AlterEnum
ALTER TYPE "ApprovalTargetType" ADD VALUE 'PAYROLL_RUN';

-- CreateTable
CREATE TABLE "PayrollConfig" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "personalDeduction" INTEGER NOT NULL DEFAULT 11000000,
    "dependentDeduction" INTEGER NOT NULL DEFAULT 4400000,
    "baseSalaryGov" INTEGER NOT NULL DEFAULT 2340000,
    "regionMinWage" INTEGER NOT NULL DEFAULT 4960000,
    "bhxhRateBps" INTEGER NOT NULL DEFAULT 800,
    "bhytRateBps" INTEGER NOT NULL DEFAULT 150,
    "bhtnRateBps" INTEGER NOT NULL DEFAULT 100,
    "pitBrackets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryComponent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SalaryComponentKind" NOT NULL DEFAULT 'EARNING',
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "insurance" BOOLEAN NOT NULL DEFAULT false,
    "defaultAmount" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSalary" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "baseSalary" INTEGER NOT NULL,
    "insuranceSalary" INTEGER,
    "componentsJson" JSONB,
    "effectiveDate" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeSalary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollConfig_orgId_key" ON "PayrollConfig"("orgId");

-- CreateIndex
CREATE INDEX "SalaryComponent_orgId_active_idx" ON "SalaryComponent"("orgId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryComponent_orgId_code_key" ON "SalaryComponent"("orgId", "code");

-- CreateIndex
CREATE INDEX "EmployeeSalary_orgId_employeeId_effectiveDate_idx" ON "EmployeeSalary"("orgId", "employeeId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSalary_employeeId_effectiveDate_key" ON "EmployeeSalary"("employeeId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "PayrollConfig" ADD CONSTRAINT "PayrollConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryComponent" ADD CONSTRAINT "SalaryComponent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalary" ADD CONSTRAINT "EmployeeSalary_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalary" ADD CONSTRAINT "EmployeeSalary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
