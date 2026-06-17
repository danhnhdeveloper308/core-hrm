-- AlterEnum
ALTER TYPE "ApproverType" ADD VALUE 'UNIT_MANAGER_OF_UNIT';

-- AlterTable
ALTER TABLE "ApprovalFlowStep" ADD COLUMN     "orgUnitId" UUID;
