-- CreateEnum
CREATE TYPE "AttendanceType" AS ENUM ('IN', 'OUT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('FACE', 'FINGERPRINT', 'MANUAL', 'WEB');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('PRESENT', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY', 'ABSENT', 'ON_LEAVE', 'HALF_LEAVE', 'HOLIDAY', 'WEEKEND', 'NOT_SCHEDULED');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AttendanceLog" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "type" "AttendanceType" NOT NULL DEFAULT 'UNKNOWN',
    "source" "AttendanceSource" NOT NULL,
    "worksiteId" UUID,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "locationSuspect" BOOLEAN NOT NULL DEFAULT false,
    "faceScore" DOUBLE PRECISION,
    "photoKey" TEXT,
    "deviceId" UUID,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceLog_pkey" PRIMARY KEY ("recordedAt","id")
) PARTITION BY RANGE ("recordedAt");

-- Partition catch-all để insert không bao giờ thất bại (cron tạo partition tháng riêng tối ưu sau)
CREATE TABLE "AttendanceLog_default" PARTITION OF "AttendanceLog" DEFAULT;

-- Helper idempotent tạo partition theo tháng — gọi bởi cron BullMQ hàng tháng.
-- Default partition trống ở khoảng tháng tương lai nên CREATE PARTITION không vướng overlap.
CREATE OR REPLACE FUNCTION create_attendance_partition(target date) RETURNS void AS $$
DECLARE
  start_date date := date_trunc('month', target)::date;
  end_date   date := (date_trunc('month', target) + interval '1 month')::date;
  part_name  text := 'AttendanceLog_' || to_char(start_date, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF "AttendanceLog" FOR VALUES FROM (%L) TO (%L)',
      part_name, start_date, end_date
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Tạo sẵn partition tháng trước, tháng này, 2 tháng kế
SELECT create_attendance_partition((CURRENT_DATE - interval '1 month')::date);
SELECT create_attendance_partition(CURRENT_DATE);
SELECT create_attendance_partition((CURRENT_DATE + interval '1 month')::date);
SELECT create_attendance_partition((CURRENT_DATE + interval '2 month')::date);

-- CreateTable
CREATE TABLE "TimesheetDay" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "shiftId" UUID,
    "firstIn" TIMESTAMP(3),
    "lastOut" TIMESTAMP(3),
    "status" "TimesheetStatus" NOT NULL DEFAULT 'NOT_SCHEDULED',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyMinutes" INTEGER NOT NULL DEFAULT 0,
    "workMinutes" INTEGER NOT NULL DEFAULT 0,
    "otMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceCorrection" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "requestedIn" TIMESTAMP(3),
    "requestedOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceLog_orgId_recordedAt_idx" ON "AttendanceLog"("orgId", "recordedAt");

-- CreateIndex
CREATE INDEX "AttendanceLog_employeeId_recordedAt_idx" ON "AttendanceLog"("employeeId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceLog_employeeId_recordedAt_source_key" ON "AttendanceLog"("employeeId", "recordedAt", "source");

-- CreateIndex
CREATE INDEX "TimesheetDay_orgId_date_idx" ON "TimesheetDay"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetDay_employeeId_date_key" ON "TimesheetDay"("employeeId", "date");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_orgId_employeeId_date_idx" ON "AttendanceCorrection"("orgId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_orgId_status_idx" ON "AttendanceCorrection"("orgId", "status");

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetDay" ADD CONSTRAINT "TimesheetDay_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetDay" ADD CONSTRAINT "TimesheetDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
