-- CreateEnum
CREATE TYPE "Feedback360Status" AS ENUM ('COLLECTING', 'CLOSED');

-- CreateEnum
CREATE TYPE "Rater360Relation" AS ENUM ('MANAGER', 'PEER', 'SUBORDINATE', 'SELF');

-- CreateTable
CREATE TABLE "Feedback360" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "revieweeId" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "status" "Feedback360Status" NOT NULL DEFAULT 'COLLECTING',
    "anonymous" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback360_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback360Rater" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "feedback360Id" UUID NOT NULL,
    "raterEmployeeId" UUID NOT NULL,
    "relation" "Rater360Relation" NOT NULL,
    "score" DOUBLE PRECISION,
    "comment" TEXT,
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback360Rater_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback360_orgId_cycleId_idx" ON "Feedback360"("orgId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback360_cycleId_revieweeId_key" ON "Feedback360"("cycleId", "revieweeId");

-- CreateIndex
CREATE INDEX "Feedback360Rater_orgId_raterEmployeeId_idx" ON "Feedback360Rater"("orgId", "raterEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback360Rater_feedback360Id_raterEmployeeId_key" ON "Feedback360Rater"("feedback360Id", "raterEmployeeId");

-- AddForeignKey
ALTER TABLE "Feedback360" ADD CONSTRAINT "Feedback360_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback360" ADD CONSTRAINT "Feedback360_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback360" ADD CONSTRAINT "Feedback360_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback360Rater" ADD CONSTRAINT "Feedback360Rater_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback360Rater" ADD CONSTRAINT "Feedback360Rater_feedback360Id_fkey" FOREIGN KEY ("feedback360Id") REFERENCES "Feedback360"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback360Rater" ADD CONSTRAINT "Feedback360Rater_raterEmployeeId_fkey" FOREIGN KEY ("raterEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
