-- CreateTable
CREATE TABLE "Certification" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedDate" DATE NOT NULL,
    "expiryDate" DATE,
    "credentialId" TEXT,
    "fileKey" TEXT,
    "trainingCourseId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Certification_orgId_employeeId_idx" ON "Certification"("orgId", "employeeId");

-- CreateIndex
CREATE INDEX "Certification_orgId_expiryDate_idx" ON "Certification"("orgId", "expiryDate");

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_trainingCourseId_fkey" FOREIGN KEY ("trainingCourseId") REFERENCES "TrainingCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
