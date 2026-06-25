-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "bankAccountNo" TEXT,
ADD COLUMN     "bankBranch" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "currentAddress" TEXT,
ADD COLUMN     "educationLevel" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "emergencyContactRelation" TEXT,
ADD COLUMN     "ethnicity" TEXT,
ADD COLUMN     "healthInsuranceNo" TEXT,
ADD COLUMN     "idIssuedDate" DATE,
ADD COLUMN     "idIssuedPlace" TEXT,
ADD COLUMN     "idNumber" TEXT,
ADD COLUMN     "major" TEXT,
ADD COLUMN     "maritalStatus" "MaritalStatus",
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "permanentAddress" TEXT,
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "religion" TEXT,
ADD COLUMN     "socialInsuranceNo" TEXT,
ADD COLUMN     "taxCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarKey" TEXT;

-- CreateTable
CREATE TABLE "Dependent" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "dob" DATE,
    "taxCode" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dependent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dependent_employeeId_idx" ON "Dependent"("employeeId");

-- AddForeignKey
ALTER TABLE "Dependent" ADD CONSTRAINT "Dependent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
