-- CreateTable
CREATE TABLE "BenefitPlan" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenefitPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBenefit" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "benefitPlanId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "amount" INTEGER,
    "startDate" DATE,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BenefitPlan_orgId_active_idx" ON "BenefitPlan"("orgId", "active");

-- CreateIndex
CREATE INDEX "EmployeeBenefit_orgId_employeeId_idx" ON "EmployeeBenefit"("orgId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeBenefit_benefitPlanId_employeeId_key" ON "EmployeeBenefit"("benefitPlanId", "employeeId");

-- AddForeignKey
ALTER TABLE "BenefitPlan" ADD CONSTRAINT "BenefitPlan_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBenefit" ADD CONSTRAINT "EmployeeBenefit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBenefit" ADD CONSTRAINT "EmployeeBenefit_benefitPlanId_fkey" FOREIGN KEY ("benefitPlanId") REFERENCES "BenefitPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBenefit" ADD CONSTRAINT "EmployeeBenefit_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
