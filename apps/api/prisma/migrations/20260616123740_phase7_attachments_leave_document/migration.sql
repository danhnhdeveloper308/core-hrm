-- CreateEnum
CREATE TYPE "AttachmentTargetType" AS ENUM ('LEAVE_REQUEST', 'ATTENDANCE_CORRECTION', 'OT_REQUEST');

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "requiresDocument" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "targetType" "AttachmentTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attachment_orgId_targetType_targetId_idx" ON "Attachment"("orgId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
