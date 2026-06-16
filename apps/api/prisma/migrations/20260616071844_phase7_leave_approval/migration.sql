-- CreateEnum
CREATE TYPE "LeaveAccrualType" AS ENUM ('YEARLY_UPFRONT', 'MONTHLY');

-- CreateEnum
CREATE TYPE "LeaveEntryType" AS ENUM ('ACCRUAL', 'USAGE', 'REVERT', 'CARRY_OVER', 'EXPIRY', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LeaveHalf" AS ENUM ('FULL', 'AM', 'PM');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalTargetType" AS ENUM ('LEAVE', 'ATTENDANCE_CORRECTION', 'OT');

-- CreateEnum
CREATE TYPE "ApproverType" AS ENUM ('DIRECT_MANAGER', 'MANAGEMENT_CHAIN', 'UNIT_MANAGER_OF_TYPE', 'ROLE', 'SPECIFIC_USER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVE', 'REJECT');

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "orgUnitId" UUID,
    "daysPerYear" DECIMAL(5,2) NOT NULL,
    "accrualType" "LeaveAccrualType" NOT NULL DEFAULT 'YEARLY_UPFRONT',
    "prorateFirstYear" BOOLEAN NOT NULL DEFAULT true,
    "seniorityBonusDays" INTEGER NOT NULL DEFAULT 0,
    "seniorityEveryYears" INTEGER NOT NULL DEFAULT 5,
    "carryOverMaxDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "carryOverExpiresOn" TEXT,
    "allowNegativeBalance" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalanceEntry" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(6,2) NOT NULL,
    "type" "LeaveEntryType" NOT NULL,
    "reason" TEXT NOT NULL,
    "period" TEXT,
    "expiresAt" TIMESTAMP(3),
    "requestId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveBalanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startHalf" "LeaveHalf" NOT NULL DEFAULT 'FULL',
    "endHalf" "LeaveHalf" NOT NULL DEFAULT 'FULL',
    "totalDays" DECIMAL(5,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalFlow" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "targetType" "ApprovalTargetType" NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalFlowStep" (
    "id" UUID NOT NULL,
    "flowId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "approverType" "ApproverType" NOT NULL,
    "chainLevel" INTEGER,
    "unitTypeCode" TEXT,
    "roleId" UUID,
    "userId" UUID,
    "slaHours" INTEGER,

    CONSTRAINT "ApprovalFlowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalInstance" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "targetType" "ApprovalTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "flowId" UUID,
    "requesterEmpId" UUID NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "stepsSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAction" (
    "id" UUID NOT NULL,
    "instanceId" UUID NOT NULL,
    "step" INTEGER NOT NULL,
    "actorId" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_orgId_code_key" ON "LeaveType"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LeavePolicy_orgId_leaveTypeId_orgUnitId_key" ON "LeavePolicy"("orgId", "leaveTypeId", "orgUnitId");

-- CreateIndex
CREATE INDEX "LeaveBalanceEntry_employeeId_leaveTypeId_year_idx" ON "LeaveBalanceEntry"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "LeaveBalanceEntry_orgId_idx" ON "LeaveBalanceEntry"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalanceEntry_employeeId_leaveTypeId_type_period_key" ON "LeaveBalanceEntry"("employeeId", "leaveTypeId", "type", "period");

-- CreateIndex
CREATE INDEX "LeaveRequest_orgId_employeeId_idx" ON "LeaveRequest"("orgId", "employeeId");

-- CreateIndex
CREATE INDEX "LeaveRequest_orgId_status_idx" ON "LeaveRequest"("orgId", "status");

-- CreateIndex
CREATE INDEX "ApprovalFlow_orgId_targetType_idx" ON "ApprovalFlow"("orgId", "targetType");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalFlowStep_flowId_order_key" ON "ApprovalFlowStep"("flowId", "order");

-- CreateIndex
CREATE INDEX "ApprovalInstance_orgId_targetType_targetId_idx" ON "ApprovalInstance"("orgId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "ApprovalInstance_orgId_status_idx" ON "ApprovalInstance"("orgId", "status");

-- CreateIndex
CREATE INDEX "ApprovalAction_instanceId_idx" ON "ApprovalAction"("instanceId");

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceEntry" ADD CONSTRAINT "LeaveBalanceEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceEntry" ADD CONSTRAINT "LeaveBalanceEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceEntry" ADD CONSTRAINT "LeaveBalanceEntry_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalFlow" ADD CONSTRAINT "ApprovalFlow_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalFlowStep" ADD CONSTRAINT "ApprovalFlowStep_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "ApprovalFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ApprovalInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
