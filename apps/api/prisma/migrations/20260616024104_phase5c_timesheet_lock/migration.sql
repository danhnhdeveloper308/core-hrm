-- AlterTable
ALTER TABLE "TimesheetDay" ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT;
