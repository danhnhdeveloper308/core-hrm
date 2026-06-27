-- CreateEnum
CREATE TYPE "TrainingMode" AS ENUM ('ONLINE', 'OFFLINE', 'EXTERNAL');

-- CreateTable
CREATE TABLE "TrainingCourse" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "mode" "TrainingMode" NOT NULL DEFAULT 'OFFLINE',
    "provider" TEXT,
    "durationHours" DOUBLE PRECISION,
    "cost" INTEGER,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCourse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingCourse_orgId_active_idx" ON "TrainingCourse"("orgId", "active");

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
